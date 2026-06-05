# Google Cloud Run 部署

本專案以 **Express + Vite 靜態檔** 單一容器運行，不再依賴 Vercel Serverless。

## 環境變數（Cloud Run）

| 變數 | 必填 | 說明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 連線字串（建議 `?sslmode=require`） |
| `JWT_SECRET` | 是 | 登入 session 簽章用長隨機字串 |
| `PORT` | 否 | Cloud Run 自動注入，預設 `8080` |
| `NODE_ENV` | 建議 | 設為 `production`（Dockerfile 已設定） |
| `ADMIN_USERNAME` | 選填 | 首次 `db:seed` 用 |
| `ADMIN_PASSWORD` | 選填 | 首次 `db:seed` 用 |

## 本機測試

```bash
# 1. 環境變數
copy .env.example .env.local
# 編輯 .env.local 填入 DATABASE_URL、JWT_SECRET

# 2. 資料庫（首次）
npm.cmd run db:setup

# 3a. 線上模式開發（Express + Vite 熱更新，port 8080）
npm.cmd run dev:online

# 3b. 正式模式本機（需先 build）
npm.cmd run build
set NODE_ENV=production
npm.cmd start
# 瀏覽 http://127.0.0.1:8080

# 4. demo 模式（localStorage，無資料庫）
npm.cmd run dev:demo
```

## Cloud Run 部署

```bash
# 設定專案與區域
gcloud config set project YOUR_PROJECT_ID
gcloud config set run/region asia-east1

# 建置並推送映像（Artifact Registry 需先建立 repository）
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/rmbsale/app:latest

# 部署
gcloud run deploy rmbsale \
  --image REGION-docker.pkg.dev/PROJECT_ID/rmbsale/app:latest \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "DATABASE_URL=rmbsale-database-url:latest,JWT_SECRET=rmbsale-jwt-secret:latest"

# 首次部署後在本機對正式庫執行 migration（或 Cloud SQL 連線後執行）
# DATABASE_URL=... npm.cmd run db:migrate
# DATABASE_URL=... npm.cmd run db:seed
```

健康檢查：`GET /health` → `{"ok":true}`
