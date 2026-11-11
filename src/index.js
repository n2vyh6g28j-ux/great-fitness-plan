import STATIC_HTML from "../public/index.html";

const IDS={check:'05b0f760-0236-4218-ac63-a02e148cdd51',record:'c590f3b5-d47d-42ad-a0bb-563f3e02343b',anchor:'305a10ef-26da-46d5-b603-e40dc3c16736'};
const BASE_HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()'};
const js=(v,status=200)=>Response.json(v,{status,headers:BASE_HEADERS});
const err=(code,message)=>Object.assign(new Error(message),{httpStatus:code});
async function jsonBody(req,maxBytes=10000){
 const contentType=req.headers.get('Content-Type')||'';
 if(!/^application\/json(?:\s*;|\s*$)/i.test(contentType))throw err(415,'僅支援 application/json');
 const length=Number(req.headers.get('Content-Length')||0);
 if(length>maxBytes)throw err(413,'資料太大');
 if(!req.body)throw err(400,'缺少 JSON 內容');
 const reader=req.body.getReader(),pieces=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw err(413,'資料太大')}pieces.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const p of pieces){bytes.set(p,offset);offset+=p.byteLength}
 let parsed;try{parsed=JSON.parse(new TextDecoder().decode(bytes))}catch{throw err(400,'JSON 格式錯誤')}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw err(400,'JSON 格式錯誤');return parsed;
}
function htmlResponse(){
 const raw=crypto.getRandomValues(new Uint8Array(16));const nonce=btoa(String.fromCharCode(...raw));
 const content=STATIC_HTML.replace(/<script(?=[\s>])/g,'<script nonce="'+nonce+'"');
 const csp=["default-src 'none'","script-src 'nonce-"+nonce+"'","style-src 'self' 'unsafe-inline' https://fonts.googleapis.com","font-src https://fonts.gstatic.com","img-src 'self' data:","connect-src 'self'","form-action 'self'","frame-ancestors 'none'","base-uri 'none'","object-src 'none'","upgrade-insecure-requests"].join('; ');
 return new Response(content,{headers:{...BASE_HEADERS,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':csp,'Strict-Transport-Security':'max-age=31536000'}})
}

const text=s=>({title:[{text:{content:s}}]});
const prop=(p,k)=>p?.[k]||{};
const plain=(p,k)=>(prop(p,k).rich_text||[]).map(t=>t.plain_text).join('');
const dt=(p,k)=>prop(p,k).date?.start?.slice(0,10)||'';
const personOK=p=>p==='小抓'||p==='阿軒';
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'));
const n=v=>v===undefined||v===null||v===''?null:Number(v);
async function notion(env,method,path,body){
 const r=await fetch('https://api.notion.com/v1'+path,{method,headers:{'Authorization':'Bearer '+env.NOTION_TOKEN,'Notion-Version':'2025-09-03','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const x=await r.json().catch(()=>({}));
 if(!r.ok){const err=new Error('Notion HTTP '+r.status+' ('+(x.code||'error')+'): '+String(x.message||'請檢查資料庫授權與欄位').slice(0,260));err.notionStatus=r.status;throw err;}
 return x;
}
async function list(env,id){
 let rows=[],cursor=null;
 do{
  const x=await notion(env,'POST','/data_sources/'+id+'/query',Object.assign({page_size:100},cursor?{start_cursor:cursor}:{}));
  rows.push(...x.results);cursor=x.has_more?x.next_cursor:null;
 }while(cursor&&rows.length<5000);
 if(cursor)throw Error('資料超過同步上限');
 return rows;
}
const create=(env,id,properties)=>notion(env,'POST','/pages',{parent:{type:'data_source_id',data_source_id:id},properties});
const update=(env,id,properties)=>notion(env,'PATCH','/pages/'+id,{properties});
async function getState(env){
 const [cs,rs,as]=await Promise.all([list(env,IDS.check),list(env,IDS.record),list(env,IDS.anchor)]);
 const checks={};
 for(const r of cs){const date=dt(r.properties,'日期'),person=prop(r.properties,'對象').select?.name;if(!validDate(date)||!personOK(person))continue;(checks[date]??={})[person]=!!prop(r.properties,'完成').checkbox;}
 const records=rs.map(r=>{const p=r.properties;return {id:plain(p,'紀錄ID')||r.id,person:prop(p,'對象').select?.name||'',date:dt(p,'日期'),weight:prop(p,'體重kg').number??'',muscle:prop(p,'骨骼肌kg').number??'',fatMass:prop(p,'體脂肪kg').number??'',fatPct:prop(p,'體脂率').number??'',visceral:prop(p,'內臟脂肪').number??'',waist:prop(p,'腰圍cm').number??''};});
 const primary=as.find(r=>prop(r.properties,'Name').title?.[0]?.plain_text==='主要週期');
 return {checks,records,anchor:primary?dt(primary.properties,'第一次測量日'):'',serverTime:new Date().toISOString()};
}
async function setCheck(env,b){
 if(!validDate(b.date)||!personOK(b.person)||typeof b.done!=='boolean')throw Error('完成狀態無效');
 const rows=await list(env,IDS.check);
 const old=rows.find(r=>dt(r.properties,'日期')===b.date&&prop(r.properties,'對象').select?.name===b.person);
 const pp={'完成':{checkbox:b.done},'更新時間':{rich_text:[{text:{content:new Date().toISOString()}}]}};
 const saved=old?await update(env,old.id,pp):await create(env,IDS.check,{'Name':text(b.date+' '+b.person),'日期':{date:{start:b.date}},'對象':{select:{name:b.person}},'訓練類型':{select:{name:[2,4,6].includes(new Date(b.date+'T12:00:00Z').getUTCDay())?'健身房':'有氧'}},...pp});
 if(!saved.id)throw Error('Notion 沒有回傳紀錄 ID');
 const verified=await notion(env,'GET','/pages/'+saved.id);
 if(dt(verified.properties,'日期')!==b.date||prop(verified.properties,'對象').select?.name!==b.person||prop(verified.properties,'完成').checkbox!==b.done)throw Error('Notion 寫入驗證不一致，請重試');
 return {ok:true,verified:true,id:saved.id,date:b.date,person:b.person,done:b.done};
}
async function setAnchor(env,b){
 if(!validDate(b.anchor))throw Error('無效日期');
 const rows=await list(env,IDS.anchor);
 const old=rows.find(r=>prop(r.properties,'Name').title?.[0]?.plain_text==='主要週期');
 const pp={'第一次測量日':{date:{start:b.anchor}},'週期間隔天數':{number:28}};
 if(old)await update(env,old.id,pp);else await create(env,IDS.anchor,{'Name':text('主要週期'),...pp});
 return {ok:true};
}
const fields={weight:'體重kg',muscle:'骨骼肌kg',fatMass:'體脂肪kg',fatPct:'體脂率',visceral:'內臟脂肪',waist:'腰圍cm'};
async function setRecord(env,b){
 if(!personOK(b.person)||!validDate(b.date)||typeof b.id!=='string'||!/^[-_a-zA-Z0-9]{1,90}$/.test(b.id))throw Error('紀錄資料無效');
 const pp={'對象':{select:{name:b.person}},'日期':{date:{start:b.date}},'紀錄ID':{rich_text:[{text:{content:b.id}}]}};
 for(const [key,name] of Object.entries(fields)){const value=n(b[key]);if(value!==null&&(!Number.isFinite(value)||value<0||value>500||key==='fatPct'&&value>100))throw Error('量測數值無效');pp[name]={number:value};}
 const rows=await list(env,IDS.record);const old=rows.find(r=>plain(r.properties,'紀錄ID')===b.id);
 if(old)await update(env,old.id,pp);else await create(env,IDS.record,{'Name':text(b.date+' '+b.person),...pp});
 return {ok:true};
}
async function delRecord(env,id){
 if(!/^[-_a-zA-Z0-9]{1,90}$/.test(id))throw Error('紀錄 ID 無效');
 const rows=await list(env,IDS.record);const old=rows.find(r=>plain(r.properties,'紀錄ID')===id);
 if(!old)throw Error('紀錄不存在');
 await notion(env,'PATCH','/pages/'+old.id,{archived:true});return {ok:true};
}
async function equal(a,b){
 const enc=new TextEncoder(),[x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
 const l=new Uint8Array(x),r=new Uint8Array(y);let d=0;for(let i=0;i<l.length;i++)d|=l[i]^r[i];return d===0;
}
export default {async fetch(req,env,ctx){
 // Fail closed even if a public route is accidentally reopened before Access is configured.
 if(!ctx?.access||typeof ctx.access.getIdentity!=='function')return js({error:'私人網站尚未完成 Access 驗證'},403);
 let identity;try{identity=await ctx.access.getIdentity()}catch{return js({error:'Access 身分驗證失敗'},403)}
 if(!identity?.email)return js({error:'Access 身分資訊缺失'},403);
 const path=new URL(req.url).pathname;
 if(!path.startsWith('/api/'))return req.method==='GET'&&(path==='/'||path==='/index.html')?htmlResponse():js({error:'找不到頁面'},404);
 if(!env.NOTION_TOKEN||!env.APP_PASSWORD)return js({error:'伺服器尚未設定 Secrets'},503);
 if(!await equal((req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,''),env.APP_PASSWORD))return js({error:'密碼不正確'},401);
 if(req.method!=='GET'&&req.headers.get('Origin')&&req.headers.get('Origin')!==new URL(req.url).origin)return js({error:'不允許跨站寫入'},403);
 const site=req.headers.get('Sec-Fetch-Site');if(req.method!=='GET'&&site&&!['same-origin','none'].includes(site))return js({error:'跨站請求已拒絕'},403);
 try{
  if(path==='/api/state'&&req.method==='GET')return js(await getState(env));
  if(req.method==='POST'&&['/api/check','/api/anchor','/api/record'].includes(path)){
   const b=await jsonBody(req);
   return js(await ({'/api/check':setCheck,'/api/anchor':setAnchor,'/api/record':setRecord}[path])(env,b));
  }
  if(req.method==='DELETE'&&path.startsWith('/api/record/'))return js(await delRecord(env,decodeURIComponent(path.slice('/api/record/'.length))));
  return js({error:'未知端點'},404);
 }catch(e){if(e.notionStatus)return js({error:'Notion API 回應 '+e.notionStatus+'，請確認授權及資料格式'},502);const message=String(e.message||e).slice(0,160);return js({error:message},e.httpStatus||400);}
}};
