# Asia deployment target

Production target: deploy Cloud Run to `asia-east1` (Taiwan) and use an Asia Neon database region such as `aws-ap-southeast-1` (Singapore) to keep request latency low for Taiwan users.

# 部署說明（已改為 Google Cloud Run）

本專案不再部署至 Vercel。請改看 **[CLOUD_RUN.md](./CLOUD_RUN.md)** 取得完整步驟。

## 快速摘要

1. 準備 PostgreSQL（Neon、Cloud SQL 等），取得 `DATABASE_URL`
2. 設定 `JWT_SECRET` 與選填的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`
3. `npm run build` → Docker 映像 → `gcloud run deploy`
4. 首次部署後在本機執行 `npm run db:migrate` 與 `npm run db:seed`（對正式庫）

舊版 Vercel 自動化腳本（`scripts/run-setup-auto.cmd` 等）僅供歷史參考，新部署請勿使用。
