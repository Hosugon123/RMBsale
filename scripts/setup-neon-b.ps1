# 路線 B：使用 Neon API Key 全自動建立資料庫並寫入 Vercel
# 用法（請在本機 PowerShell 執行，勿把金鑰貼到聊天）：
#   $env:NEON_API_KEY = "napi_xxxxxxxx"
#   .\scripts\run-setup-neon-b.cmd
#   （或：powershell -ExecutionPolicy Bypass -File .\scripts\setup-neon-b.ps1）

param(
  [string]$ApiKey = $env:NEON_API_KEY,
  [string]$ProjectName = "rmbsale-shared"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $ApiKey) {
  throw @"
請先設定 Neon API Key：
  1. 開啟 https://console.neon.tech/app/settings/api-keys → Create
  2. 在本機終端機執行：
     `$env:NEON_API_KEY = '你的金鑰'
     .\scripts\setup-neon-b.ps1
"@
}

$neon = "npx.cmd --yes neonctl@latest"
$vercel = "npx.cmd --yes vercel@latest"

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

Write-Step "讀取 Neon 組織"
$orgsJson = & cmd /c "$neon orgs list --api-key `"$ApiKey`" --output json" | Out-String
$orgs = $orgsJson | ConvertFrom-Json
if (-not $orgs -or $orgs.Count -eq 0) { throw "找不到 Neon 組織，請確認 API Key 權限" }
$orgId = $orgs[0].id
Write-Host "使用組織：$($orgs[0].name) ($orgId)"

Write-Step "建立 Neon 專案 $ProjectName（若已存在則略過）"
$existing = & cmd /c "$neon projects list --api-key `"$ApiKey`" --org-id `"$orgId`" --output json" | Out-String | ConvertFrom-Json
if (-not ($existing | Where-Object { $_.name -eq $ProjectName })) {
  & cmd /c "$neon projects create --name `"$ProjectName`" --org-id `"$orgId`" --api-key `"$ApiKey`" --output json"
  if ($LASTEXITCODE -ne 0) { throw "建立 Neon 專案失敗" }
}

Write-Step "取得連線字串"
$dbUrl = (& cmd /c "$neon connection-string `"$ProjectName`" --org-id `"$orgId`" --api-key `"$ApiKey`" --pooled" | Out-String).Trim()
if (-not $dbUrl -or $dbUrl -notmatch "^postgres") { throw "無法取得 DATABASE_URL" }

Write-Step "寫入 Vercel 環境變數 DATABASE_URL"
& cmd /c "$vercel whoami" | Out-Null
if (-not (Test-Path ".vercel\project.json")) { & cmd /c "$vercel link --yes" | Out-Null }
& cmd /c "$vercel env add DATABASE_URL production --yes --sensitive --value `"$dbUrl`""
& cmd /c "$vercel env add DATABASE_URL preview --yes --sensitive --value `"$dbUrl`""
& cmd /c "$vercel env add DATABASE_URL development --yes --sensitive --value `"$dbUrl`""

$env:DATABASE_URL = $dbUrl
& cmd /c "$vercel env pull .env --environment=production --yes"

Write-Step "執行 migration 與 seed"
npm.cmd run db:migrate
if (-not $env:ADMIN_USERNAME) { $env:ADMIN_USERNAME = "ds6186" }
if (-not $env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD = "1234" }
npm.cmd run db:seed

Write-Host "`n路線 B 完成。Neon 專案：$ProjectName" -ForegroundColor Green
Write-Host "接著可執行：.\scripts\setup-online.ps1  （補齊 JWT 等變數並部署）" -ForegroundColor Green
