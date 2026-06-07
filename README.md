# RMBsale

## Production Latency And Asia Deployment

This release includes important production latency improvements for Cloud Run + Neon:

- Cloud Run should run in `asia-east1` (Taiwan) for Taiwan users.
- Neon Postgres should be created in the nearest available Asia region, preferably Singapore `aws-ap-southeast-1` when Taiwan is not available.
- Production Cloud Run should keep `--min-instances 1` to avoid scale-to-zero cold starts during real user operations.
- Startup database maintenance is disabled by default with `RUN_STARTUP_DB_MAINTENANCE=0`; run migrations explicitly before deployment.
- Settlement refresh now loads only the required state sections (`customers`, `accounts`, `ledger`) instead of also fetching users and sales.
- Settlement operations use optimistic UI updates so the user sees the receivable/account balance update immediately while the server confirms in the background.

Deploy the Asia production target with:

```powershell
npm.cmd run deploy:asia
```

See [CLOUD_RUN.md](./CLOUD_RUN.md) for the Cloud Run settings and Neon migration notes.

RMBsale 是以 Vite + React + TypeScript 建立的人民幣代付與換匯金流記帳系統。第一版保留舊系統的核心流程，但改為前後端分離、Drizzle schema、Vercel Functions 與 Neon Postgres。

## 開發

1. 複製 `.env.example` 為 `.env.local`，填入 PostgreSQL 的 `DATABASE_URL` 與 `JWT_SECRET` 等。
2. 初始化資料庫（首次）：

```bash
npm.cmd run db:setup
```

3. 啟動（Express 單一服務，與 Cloud Run 相同架構）：

```bash
npm.cmd install
npm.cmd run dev:online
```

`dev:online` 會在 **port 8080** 啟動 Express：同時提供 `/api` 與 Vite 前端熱更新。預設帳號見 `.env.example`（`ds001` / `1234`）。

僅要本機 localStorage 示範、不連資料庫時：

```bash
npm.cmd run dev:demo
```

正式模式本機驗證（build 後靜態檔 + API）：

```bash
npm.cmd run build
npm.cmd start
```

**Google Cloud Run 部署** 詳見 [CLOUD_RUN.md](./CLOUD_RUN.md)。

PowerShell 若擋 `npm.ps1`，請使用 `npm.cmd`。

## 資料庫

部署到 Cloud Run（或任何 Node 主機）時，設定：

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

**公司共用線上版**：請依 [CLOUD_RUN.md](./CLOUD_RUN.md) 部署至 Cloud Run、執行 `npm run db:setup`，部署後所有人登入同一 PostgreSQL 查帳對帳。

## 核心原則

- 金額計算使用 `decimal.js`。
- 正式資料庫金額欄位使用 `numeric`。
- 交易採追加式 `ledger_entries`，取消交易用 reversal，不直接硬刪歷史。
- `admin` 管理設定與稽核；`operator` 執行日常交易。

## 非工程背景時的開發決策原則

本專案維護者並非專業程式工程師。遇到**程式處理、演算法、架構或較專業的技術問題**時，請先參考業界常見做法，再決定要怎麼改，不要憑直覺硬寫。

### 什麼時候要先查？

- 金流、帳務、庫存成本（例如 FIFO）、匯率換算、對帳邏輯
- 資料庫交易（transaction）、併發、資料一致性
- 權限、稽核、登入安全
- 部署、連線池、Serverless 限制（例如 Neon HTTP 不支援 transaction）
- 任何「不確定業界通常怎麼做」的設計

### 建議怎麼查？

1. **先找同類型產品或專業公司怎麼做**  
   例如會計軟體、金流平台、ERP、交易所帳務、銀行核心常見做法。
2. **對照官方文件與成熟開源專案**  
   優先採用已被大量驗證的模式，而不是自創流程。
3. **把結論寫清楚再動手**  
   簡短記錄：問題是什麼、業界怎麼解、本專案為何採用、取捨是什麼。
4. **小步驗證**  
   改動後用實際案例（入金、出金、買入、售出、轉帳、收帳）驗證，避免只看畫面以為正確。

### 本專案已採用的業界參考（範例）

| 問題 | 常見做法 | 本專案作法 |
|------|----------|------------|
| RMB 庫存成本 | FIFO / 批次成本，不隨市價改寫歷史成本 | 入金建 lot、出金 FIFO 扣庫存 |
| 帳務異動 | 追加式流水 + 沖銷，避免直接改歷史 | `ledger_entries` + reversal 方向 |
| 金額精度 | 不用浮點數算錢 | `decimal.js` + DB `numeric` |
| Neon 線上交易 | HTTP 驅動不支援 transaction | 改用 `neon-serverless` Pool + WebSocket |
| Vercel 多段 API | 需實體路由檔，不能只靠 catch-all | `api/auth/login.ts` 等 shim + `[[...path]]` fallback |

之後若新增功能，建議在 PR、commit 說明或相關文件補一句「參考了什麼業界做法」，方便日後查帳與維護。
