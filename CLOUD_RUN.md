# Asia production target

- Cloud Run region: `asia-east1` (Taiwan)
- Service name: `dsrmbsys`
- Artifact Registry region: `asia-east1`
- Neon database region: choose the closest available Asia region, preferably Singapore `aws-ap-southeast-1` if Taiwan is not available in Neon.
- Keep Cloud Run and Neon in Asia. Do not keep Cloud Run in `europe-west1` for Taiwan users.
- Production settings: `--min-instances 1`, `--memory 1Gi`, `RUN_STARTUP_DB_MAINTENANCE=0`.

Neon region changes are not an in-place setting. Create a new Neon project/database in the Asia region, migrate data from the current database, then update the `rmbsale-database-url` Secret Manager value to the new Asia connection string.

Deploy to Taiwan with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-cloud-run-asia.ps1
```

# Google Cloud Run 完整部署步驟

架構：**單一 Express 容器** = `/api` 後端 + Vite 建置的靜態前端（`dist/`）。

---

## 一、前置準備

### 1. Google Cloud 專案

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud config set run/region asia-east1
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

### 2. Artifact Registry（映像倉庫，首次）

```bash
gcloud artifacts repositories create rmbsale \
  --repository-format=docker \
  --location=asia-east1 \
  --description="RMBsale app images"
```

### 3. PostgreSQL 資料庫

任選其一：

- [Neon](https://neon.tech)（Serverless Postgres）
- Google Cloud SQL for PostgreSQL
- 其他託管 PostgreSQL

取得連線字串，格式類似：

```
postgresql://user:password@host:5432/dbname?sslmode=require
```

記下為 `DATABASE_URL`。

### 測試與正式資料庫分離

- **正式**：Neon 專案 `rmbsale-prod` → GCP Secret `rmbsale-database-url` → Cloud Run `dsrmbsys`
- **本機測試**：Neon 專案 `rmbsale-dev` → 僅寫入 `.env.local`，`RMBSALE_ENV=development`
- **切勿**把正式 `DATABASE_URL` 貼到本機 `.env.local` 做 `dev:online` 或探測腳本
- 執行 `npm.cmd run db:check-isolation` 確認本機未連到正式 host
- 舊版 `setup-neon-b.ps1` 已棄用（曾造成測試／正式混庫）

建立／更新：

```powershell
# 本機測試庫
powershell -ExecutionPolicy Bypass -File scripts\setup-neon-dev.ps1

# 正式庫 Secret
powershell -ExecutionPolicy Bypass -File scripts\setup-neon-prod.ps1
```

---

### 4. 機密變數（建議用 Secret Manager）

```bash
# JWT 簽章用長隨機字串
echo -n "your-long-random-jwt-secret" | gcloud secrets create rmbsale-jwt-secret --data-file=-

# 資料庫連線
echo -n "postgresql://..." | gcloud secrets create rmbsale-database-url --data-file=-
```

---

## 二、本機驗證（部署前）

```powershell
cd c:\桌面\RMBsale
npm.cmd install

# 環境變數
copy .env.example .env.local
# 編輯 .env.local：DATABASE_URL、JWT_SECRET

# 初始化資料庫（首次）
npm.cmd run db:setup

# 建置
npm.cmd run build

# 模擬正式環境啟動（必須有 DATABASE_URL、JWT_SECRET）
$env:NODE_ENV="production"
$env:JWT_SECRET="your-secret"
$env:DATABASE_URL="postgresql://..."
$env:PORT="8080"
npm.cmd start
```

瀏覽器確認：

- http://127.0.0.1:8080/health → `{"ok":true}`
- http://127.0.0.1:8080/ → 前端頁面
- 登入後 API 正常

開發模式（熱更新，單埠 8080）：

```powershell
npm.cmd run dev:online
```

---

## 三、建置 Docker 映像

```bash
# 專案根目錄
gcloud builds submit --tag asia-east1-docker.pkg.dev/YOUR_PROJECT_ID/rmbsale/app:latest
```

本機 Docker 測試（選用）：

```bash
docker build -t rmbsale:local .
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secret \
  -e DATABASE_URL=postgresql://... \
  rmbsale:local
```

---

## 四、部署至 Cloud Run

```bash
gcloud run deploy rmbsale \
  --image asia-east1-docker.pkg.dev/YOUR_PROJECT_ID/rmbsale/app:latest \
  --platform managed \
  --region asia-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --set-env-vars "NODE_ENV=production,RUN_STARTUP_DB_MAINTENANCE=0" \
  --set-secrets "DATABASE_URL=rmbsale-database-url:latest,JWT_SECRET=rmbsale-jwt-secret:latest"
```

部署完成後會顯示服務 URL，例如 `https://rmbsale-xxxxx-asia-east1.a.run.app`。

### Latency settings

- Keep `--min-instances 1` for production so Cloud Run does not scale to zero between real user operations.
- Keep Cloud Run and Neon Postgres in nearby regions. Cross-region database transactions can make every create/update request feel slow.
- Run `npm.cmd run db:migrate` before deploying schema changes. Startup DB maintenance is disabled by default with `RUN_STARTUP_DB_MAINTENANCE=0`; set it to `1` only for a one-off maintenance deploy.

---

## 五、首次上線：資料庫 migration

容器內不含 `tsx`，請在本機對**正式庫**執行：

```powershell
$env:DATABASE_URL="postgresql://...（正式庫）"
$env:JWT_SECRET="..."
$env:ADMIN_USERNAME="ds6186"
$env:ADMIN_PASSWORD="強密碼"
npm.cmd run db:migrate
npm.cmd run db:seed
```

---

## 六、環境變數一覽

| 變數 | 必填 | 說明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 連線字串 |
| `JWT_SECRET` | 是 | 登入 session 簽章 |
| `PORT` | 否 | Cloud Run 自動注入（程式預設 8080） |
| `NODE_ENV` | 建議 | `production`（Dockerfile 已設） |
| `ADMIN_USERNAME` | 選填 | seed 用，預設 `ds6186` |
| `ADMIN_PASSWORD` | 選填 | seed 用 |

---

## 七、更新部署

程式碼變更後：

```bash
gcloud builds submit --tag asia-east1-docker.pkg.dev/YOUR_PROJECT_ID/rmbsale/app:latest
gcloud run deploy rmbsale --image asia-east1-docker.pkg.dev/YOUR_PROJECT_ID/rmbsale/app:latest --region asia-east1
```

若 schema 有變更，再執行 `npm run db:migrate`（對正式庫）。

---

## 八、健康檢查

- HTTP：`GET /health` → `{"ok":true}`
- Dockerfile 內建 `HEALTHCHECK` 亦會定期探測此端點

---

## 注意事項

- **勿使用 SQLite 或容器內檔案存業務資料**；所有帳務資料在 PostgreSQL。
- `npm run dev:demo` 僅本機 localStorage 示範，與 Cloud Run 無關。
- 舊 `api/*.ts` Vercel shim 檔案不會被打進映像，可忽略。
