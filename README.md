# RMBsale

RMBsale 是以 Vite + React + TypeScript 建立的人民幣代付與換匯金流記帳系統。第一版保留舊系統的核心流程，但改為前後端分離、Drizzle schema、Vercel Functions 與 Neon Postgres。

## 開發

```bash
npm.cmd install
npm.cmd run dev
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

本機未設定 `DATABASE_URL` 時，前端會使用 localStorage demo 資料，方便先驗證版面與流程。

## 核心原則

- 金額計算使用 `decimal.js`。
- 正式資料庫金額欄位使用 `numeric`。
- 交易採追加式 `ledger_entries`，取消交易用 reversal，不直接硬刪歷史。
- `admin` 管理設定與稽核；`operator` 執行日常交易。
