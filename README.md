# RMBsale

RMBsale 是以 Vite + React + TypeScript 建立的人民幣代付與換匯金流記帳系統。第一版保留舊系統的核心流程，但改為前後端分離、Drizzle schema、Vercel Functions 與 Neon Postgres。

## 開發（與正式站相同）

1. 複製 `.env.example` 為 `.env.local`，填入 Neon 的 `DATABASE_URL` 與 `JWT_SECRET` 等。
2. 初始化資料庫（首次）：

```bash
npm.cmd run db:setup
```

3. 啟動（需已安裝 Vercel CLI：`npm i -g vercel` 或 `npx vercel login`）：

```bash
npm.cmd install
npm.cmd run dev
```

`npm run dev` 會執行 `vercel dev`：前端 + `/api` 與正式站相同（登入、Neon、共用帳務）。預設帳號見 `.env.example`（`ds001` / `1234`）。

僅要本機 localStorage 示範、不連資料庫時：

```bash
npm.cmd run dev:demo
```

PowerShell 若擋 `npm.ps1`，請使用 `npm.cmd`。

## 資料庫

部署到 Vercel 時建議從 Vercel Marketplace 建立 Neon Postgres，並設定：

```bash
DATABASE_URL
JWT_SECRET
ADMIN_USERNAME
ADMIN_PASSWORD
```

產生 migration：

```bash
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
```

**公司共用線上版**：請依 [DEPLOY.md](./DEPLOY.md) 在 Vercel 建立 Neon、執行 `npm run db:setup`，部署後所有人登入同一資料庫查帳對帳。

## 核心原則

- 金額計算使用 `decimal.js`。
- 正式資料庫金額欄位使用 `numeric`。
- 交易採追加式 `ledger_entries`，取消交易用 reversal，不直接硬刪歷史。
- `admin` 管理設定與稽核；`operator` 執行日常交易。
