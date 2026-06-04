# RMBsale 線上共用資料庫部署

公司內多人對帳時，所有人應登入同一套 **Vercel + Neon Postgres**，資料即時共用（非各瀏覽器 localStorage）。

## 1. Vercel 建立 Neon 資料庫

1. 開啟 [Vercel 專案](https://vercel.com)（連線 GitHub `Hosugon123/RMBsale`）。
2. **Storage** → **Create Database** → **Neon Postgres**。
3. 記下自動產生的 `DATABASE_URL`。

## 2. 環境變數（Vercel → Settings → Environment Variables）

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | Neon 連線字串（通常由 Storage 自動帶入） |
| `JWT_SECRET` | 長隨機字串（登入 session） |
| `ADMIN_USERNAME` | 管理員帳號，預設 `ds001` |
| `ADMIN_PASSWORD` | 管理員密碼，預設 `1234`（正式環境建議改強密碼） |
| `OPERATOR_USERNAME` | 可選，預設 `operator` |
| `OPERATOR_PASSWORD` | 可選，預設 `operator123` |

部署後在 **Production** 與 **Preview** 都要設定。

## 3. 一鍵自動設定（推薦，不需 Neon API Key）

已登入 Vercel CLI 後，在專案根目錄執行：

```cmd
cd c:\桌面\RMBsale
.\scripts\run-setup-auto.cmd
```

會透過 Vercel Marketplace 建立 Neon、跑 migration/seed、寫入 JWT 與帳密；登入資訊在 `scripts\.setup-result.txt`。

若 Neon 已建立，只需補環境變數與部署：

```cmd
.\scripts\run-finish-env.cmd
npx vercel --prod --yes
```

舊腳本（需 API Key 或已綁 Storage）：

```powershell
.\scripts\run-setup-online.cmd
```

腳本會自動：

- 連結 Vercel 專案 `dsrmb-sys`
- 寫入 `JWT_SECRET`、`ADMIN_*`、`OPERATOR_*` 環境變數
- 若已綁定 Neon 或提供 `NEON_API_KEY`：拉取 `DATABASE_URL`、執行 `db:migrate` 與 `db:seed`

**若 Vercel 尚未建立 Neon**：腳本會提示你到 Vercel → Storage → Create Neon，完成後再跑一次即可。

也可全 CLI 建立 Neon（路線 B，**請在本機終端執行，勿把金鑰貼到聊天**）：

```powershell
$env:NEON_API_KEY = "napi_你的金鑰"   # 從 https://console.neon.tech/app/settings/api-keys 建立
.\scripts\run-setup-neon-b.cmd
.\scripts\run-setup-online.cmd
```

若直接執行 `.ps1` 出現「已停用指令碼執行」，請改用上面的 `.cmd`，或在本機終端機先執行一次：
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

第一支腳本會建立 Neon 專案、把 `DATABASE_URL` 寫入 Vercel，並跑 migration / seed。  
第二支腳本會補齊 `JWT_SECRET`、管理員帳密等其餘變數。

## 3b. 手動初始化（備用）

在專案根目錄建立 `.env`（勿 commit），執行 `npm run db:setup`。

## 4. 推送並部署

```powershell
git add drizzle api src DEPLOY.md
git commit -m "Add shared Postgres bootstrap and online store mode"
git push
```

Vercel 會自動 build 與部署。正式網址上 **必須登入** 才能使用（`import.meta.env.PROD` 會啟用線上模式）。

## 5. 夥伴測試方式

1. 開啟部署網址 → 導向 `/login`。
2. 使用 `operator` / `operator123`（或你設定的帳密）登入。
3. 任一人做的買入、售出、收帳、轉帳、入出金，其他人重新整理即可看到（或操作後自動刷新列表）。

管理員使用 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（預設 **ds001** / **1234**）。

### 重設管理員帳密（線上登入失敗時）

1. 在 Vercel → Settings → Environment Variables 設定（Production）：
   - `ADMIN_USERNAME` = `ds001`
   - `ADMIN_PASSWORD` = `1234`
2. 本機建立 `.env.local`（含與線上相同的 `DATABASE_URL`、`JWT_SECRET`），執行：

```powershell
npm.cmd run db:reset-admin
```

會將資料庫內舊帳號 `admin` 更名為 `ds001` 並重設密碼，或新建 `ds001`。

亦可一鍵寫入 Vercel 變數並 seed（需已 `npx vercel login` 且專案已 link）：

```powershell
.\scripts\run-finish-env.cmd
```

## 6. 本機與正式站相同（除錯用）

複製 `.env.example` 為 `.env.local`，填入 Vercel / Neon 的 `DATABASE_URL` 與 `JWT_SECRET` 等，然後：

```powershell
npm.cmd run db:setup
npm.cmd run dev
```

`npm run dev` 即 `vercel dev`（前端 + `/api` + 登入流程與正式站一致）。僅要 localStorage 示範時用 `npm run dev:demo`。

## 7. 線上版目前支援的操作

- 登入／共用讀取全部帳務（`GET /api/bootstrap`）
- 買入、售出、客戶收帳、買入付款、帳戶轉帳、入金／出金／分潤
- 新增持有人、新增帳戶、新增客戶

更名／刪除持有人或帳戶、管理後台進階設定等，線上版尚未接上 API，請暫用本機 demo 或後續迭代。

## 8. 除錯

- **Vercel → Logs**：查看 `/api/*` 錯誤
- **Neon Console → SQL**：直接查 `ledger_entries`、`sales`、`accounts`
- 登入失敗：確認 `JWT_SECRET` 與 seed 帳密
