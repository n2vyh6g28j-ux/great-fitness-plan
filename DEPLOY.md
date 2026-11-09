# 小抓與阿軒的偉大計劃｜Cloudflare + Notion

正式網站使用 Cloudflare Worker；GitHub repo 保留完整來源。

- `public/index.html`：雙人分別勾選、InBody 月曆與同步介面。
- `src/index.js`：服務端 Notion API 中介程式，必須使用 Worker Runtime Secrets：`NOTION_TOKEN` 及 `APP_PASSWORD`。
- `wrangler.jsonc`：Worker 名稱為 `piggy-fitness-plan`。

## 部署

Cloudflare Workers Builds (若有設定) 執行 `npx wrangler deploy`。或在取得 Cloudflare 授權的本機環境執行 `npm install && npm run deploy`。

## 安全

**絕對不能提交 API Token 與密碼到 GitHub。** 必須在 Cloudflare Worker **Runtime** 的 Variables and Secrets 加入兩個 Secret；Build Secrets 不會自動變成執行階段 Secret。建議另啟用 Cloudflare Access 限制只有兩位使用者可造訪網站。

## 資料來源

Notion 私人同步中心：https://app.notion.com/p/413a0a7cd85081508185e1b19084c3d7

網站連線成功後以 Notion 為正式資料來源。首次連線會備份原有 localStorage 狀態，但請自行匯出 CSV，以免遺失既有紀錄。
