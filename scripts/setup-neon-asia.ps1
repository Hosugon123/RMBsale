param(
  [string]$ApiKey = $env:NEON_API_KEY,
  [string]$ProjectName = "rmbsale-asia",
  [string]$RegionId = "aws-ap-southeast-1"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $ApiKey) {
  throw @"
請先設定 Neon API Key：
  1. 開啟 https://console.neon.tech/app/settings/api-keys
  2. PowerShell 執行：
     `$env:NEON_API_KEY = '你的金鑰'
     powershell -ExecutionPolicy Bypass -File scripts\setup-neon-asia.ps1
"@
}

$neon = "npx.cmd --yes neonctl@latest"

Write-Host "==> 讀取 Neon 組織" -ForegroundColor Cyan
$orgsJson = & cmd /c "$neon orgs list --api-key `"$ApiKey`" --output json" | Out-String
$orgs = $orgsJson | ConvertFrom-Json
if (-not $orgs -or $orgs.Count -eq 0) { throw "找不到 Neon 組織" }
$orgId = $orgs[0].id
Write-Host "使用組織：$($orgs[0].name)"

Write-Host "==> 建立亞洲 Neon 專案 $ProjectName（區域 $RegionId）" -ForegroundColor Cyan
$existing = & cmd /c "$neon projects list --api-key `"$ApiKey`" --org-id `"$orgId`" --output json" | Out-String | ConvertFrom-Json
if (-not ($existing | Where-Object { $_.name -eq $ProjectName })) {
  & cmd /c "$neon projects create --name `"$ProjectName`" --org-id `"$orgId`" --region-id `"$RegionId`" --api-key `"$ApiKey`" --output json"
  if ($LASTEXITCODE -ne 0) { throw "建立 Neon 專案失敗" }
}

Write-Host "==> 取得連線字串" -ForegroundColor Cyan
$dbUrl = (& cmd /c "$neon connection-string `"$ProjectName`" --org-id `"$orgId`" --api-key `"$ApiKey`" --pooled" | Out-String).Trim()
if (-not $dbUrl -or $dbUrl -notmatch "^postgres") { throw "無法取得 DATABASE_URL" }

$env:DATABASE_URL = $dbUrl
Write-Host "DATABASE_URL 已設定（亞洲區）"

Write-Host "==> 執行 migration" -ForegroundColor Cyan
npm.cmd run db:migrate

Write-Host ""
Write-Host "亞洲 Neon 資料庫已就緒。" -ForegroundColor Green
Write-Host "專案：$ProjectName"
Write-Host "區域：$RegionId（新加坡，距台灣最近）"
Write-Host ""
Write-Host "下一步："
Write-Host "  1. 從舊庫匯出：  `$env:DATABASE_URL='舊歐洲庫'; npm run db:export-snapshot"
Write-Host "  2. 匯入新庫：    `$env:DATABASE_URL='新亞洲庫'; npm run db:import-snapshot"
Write-Host "  3. 更新 Secret：  gcloud secrets versions add rmbsale-database-url --data-file=-"
Write-Host "  4. 部署台灣：    npm run deploy:asia"
