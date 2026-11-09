
const IDS={check:'05b0f760-0236-4218-ac63-a02e148cdd51',record:'c590f3b5-d47d-42ad-a0bb-563f3e02343b',anchor:'305a10ef-26da-46d5-b603-e40dc3c16736'};
const js=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
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
 if(!r.ok)throw Error('Notion '+r.status+': '+(x.message||'failed'));
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
 if(old)await update(env,old.id,pp);
 else await create(env,IDS.check,{'Name':text(b.date+' '+b.person),'日期':{date:{start:b.date}},'對象':{select:{name:b.person}},'訓練類型':{select:{name:[2,4,6].includes(new Date(b.date+'T12:00:00Z').getUTCDay())?'健身房':'有氧'}},...pp});
 return {ok:true};
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
export default {async fetch(req,env){
 const path=new URL(req.url).pathname;
 if(!path.startsWith('/api/')){
  if(typeof STATIC_HTML!=='undefined')return new Response(STATIC_HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
  return env.ASSETS.fetch(req);
 }
 if(!env.NOTION_TOKEN||!env.APP_PASSWORD)return js({error:'伺服器尚未設定 Secrets'},503);
 if(!await equal((req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,''),env.APP_PASSWORD))return js({error:'密碼不正確'},401);
 if(req.method!=='GET'&&req.headers.get('Origin')&&req.headers.get('Origin')!==new URL(req.url).origin)return js({error:'不允許跨站寫入'},403);
 try{
  if(path==='/api/state'&&req.method==='GET')return js(await getState(env));
  if(req.method==='POST'&&['/api/check','/api/anchor','/api/record'].includes(path)){
   if(Number(req.headers.get('Content-Length')||0)>10000)return js({error:'資料太大'},413);
   const b=await req.json();
   return js(await ({'/api/check':setCheck,'/api/anchor':setAnchor,'/api/record':setRecord}[path])(env,b));
  }
  if(req.method==='DELETE'&&path.startsWith('/api/record/'))return js(await delRecord(env,decodeURIComponent(path.slice('/api/record/'.length))));
  return js({error:'未知端點'},404);
 }catch(e){const message=String(e.message||e);return js({error:message.startsWith('Notion ')?'Notion 連線失敗；請確認金鑰與三個資料庫的授權':message},message.startsWith('Notion ')?502:400);}
}};
