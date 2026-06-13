# 建立「測試／本機專用」Neon 資料庫，寫入 .env.local（不碰正式 Secret）
# 用法：
#   $env:NEON_API_KEY = "napi_xxxxxxxx"
#   powershell -ExecutionPolicy Bypass -File scripts\setup-neon-dev.ps1
#
# 正式庫請用 setup-neon-prod.ps1 或手動更新 gcloud secret rmbsale-database-url

param(
  [string]$ApiKey = $env:NEON_API_KEY,
  [string]$ProjectName = "rmbsale-dev",
  [string]$RegionId = "aws-ap-southeast-1",
  [string]$ProductionDbHost = $env:RMBSALE_PRODUCTION_DB_HOST
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $ApiKey) {
  throw "請設定 `$env:NEON_API_KEY"
}

$neon = "npx.cmd --yes neonctl@latest"

Write-Host "==> 建立本機測試用 Neon：$ProjectName" -ForegroundColor Cyan
$orgsJson = & cmd /c "$neon orgs list --api-key `"$ApiKey`" --output json" | Out-String
$orgs = $orgsJson | ConvertFrom-Json
$orgId = $orgs[0].id

$existing = & cmd /c "$neon projects list --api-key `"$ApiKey`" --org-id `"$orgId`" --output json" | Out-String | ConvertFrom-Json
if (-not ($existing | Where-Object { $_.name -eq $ProjectName })) {
  & cmd /c "$neon projects create --name `"$ProjectName`" --org-id `"$orgId`" --region-id `"$RegionId`" --api-key `"$ApiKey`" --output json"
}

$dbUrl = (& cmd /c "$neon connection-string `"$ProjectName`" --org-id `"$orgId`" --api-key `"$ApiKey`" --pooled" | Out-String).Trim()
if (-not $dbUrl -or $dbUrl -notmatch "^postgres") { throw "無法取得 DATABASE_URL" }

$devHost = ([uri]($dbUrl -replace '^postgresql://','http://')).Host

$prodHostLine = if ($ProductionDbHost) {
  "RMBSALE_PRODUCTION_DB_HOST=$ProductionDbHost"
} else {
  "# RMBSALE_PRODUCTION_DB_HOST=ep-xxxx.ap-southeast-1.aws.neon.tech"
}

$envLines = @(
  "# 本機測試專用（勿與 Cloud Run Secret rmbsale-database-url 相同）",
  "RMBSALE_ENV=development",
  "DATABASE_URL=$dbUrl",
  $prodHostLine,
  "JWT_SECRET=dev-only-change-me-local-jwt-secret",
  "ADMIN_USERNAME=ds001",
  "ADMIN_PASSWORD=1234",
  "VITE_DEV=1",
  "VITE_USE_DEMO=false",
  "# 若上方未自動填入，請手動設定正式庫 host（setup-neon-prod.ps1 會印出）"
)

$envPath = Join-Path $Root ".env.local"
$envLines -join "`n" | Set-Content -Path $envPath -Encoding UTF8

$env:DATABASE_URL = $dbUrl
$env:RMBSALE_ENV = "development"
npm.cmd run db:migrate
npm.cmd run db:seed

Write-Host ""
Write-Host "本機測試庫已就緒：$ProjectName" -ForegroundColor Green
Write-Host "已寫入 .env.local（RMBSALE_ENV=development）"
Write-Host "dev host: $devHost"
Write-Host ""
Write-Host "請在 .env.local 設定 RMBSALE_PRODUCTION_DB_HOST=你的正式 Neon host，執行 npm run db:check-isolation 確認未連到正式庫。"
Write-Host "啟動：npm.cmd run dev:online"
