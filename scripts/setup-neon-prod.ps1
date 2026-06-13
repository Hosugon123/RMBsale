# 正式環境 Neon：僅更新 GCP Secret，不寫入本機 .env.local、不寫入 Vercel dev/preview
# 用法：
#   $env:NEON_API_KEY = "napi_xxxxxxxx"
#   powershell -ExecutionPolicy Bypass -File scripts\setup-neon-prod.ps1

param(
  [string]$ApiKey = $env:NEON_API_KEY,
  [string]$ProjectName = "rmbsale-prod",
  [string]$RegionId = "aws-ap-southeast-1",
  [string]$DatabaseSecret = "rmbsale-database-url"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $ApiKey) { throw "請設定 `$env:NEON_API_KEY" }

$neon = "npx.cmd --yes neonctl@latest"
$orgsJson = & cmd /c "$neon orgs list --api-key `"$ApiKey`" --output json" | Out-String
$orgs = $orgsJson | ConvertFrom-Json
$orgId = $orgs[0].id

Write-Host "==> 正式 Neon 專案：$ProjectName" -ForegroundColor Cyan
$existing = & cmd /c "$neon projects list --api-key `"$ApiKey`" --org-id `"$orgId`" --output json" | Out-String | ConvertFrom-Json
if (-not ($existing | Where-Object { $_.name -eq $ProjectName })) {
  & cmd /c "$neon projects create --name `"$ProjectName`" --org-id `"$orgId`" --region-id `"$RegionId`" --api-key `"$ApiKey`" --output json"
}

$dbUrl = (& cmd /c "$neon connection-string `"$ProjectName`" --org-id `"$orgId`" --api-key `"$ApiKey`" --pooled" | Out-String).Trim()
if (-not $dbUrl -or $dbUrl -notmatch "^postgres") { throw "無法取得 DATABASE_URL" }

$prodHost = ([uri]($dbUrl -replace '^postgresql://','http://')).Host
Write-Host "正式庫 host: $prodHost" -ForegroundColor Yellow

if (Get-Command gcloud -ErrorAction SilentlyContinue) {
  Write-Host "==> 更新 Secret Manager: $DatabaseSecret" -ForegroundColor Cyan
  $dbUrl | gcloud secrets versions add $DatabaseSecret --data-file=-
} else {
  Write-Host "未安裝 gcloud，請手動執行：" -ForegroundColor Yellow
  Write-Host "  echo `"$dbUrl`" | gcloud secrets versions add $DatabaseSecret --data-file=-"
}

Write-Host ""
Write-Host "⚠ 請勿將此 DATABASE_URL 放入 .env.local 做測試！" -ForegroundColor Red
Write-Host "本機測試請用：scripts/setup-neon-dev.ps1"
Write-Host "請在本機 .env.local 設定：RMBSALE_PRODUCTION_DB_HOST=$prodHost"
