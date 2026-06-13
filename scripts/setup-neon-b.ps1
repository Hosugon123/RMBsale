# ⚠ 已棄用：此腳本曾把同一 DATABASE_URL 寫入 Vercel production / preview / development，導致測試與正式混庫。
# 請改用：
#   scripts/setup-neon-dev.ps1   → 本機 .env.local（rmbsale-dev）
#   scripts/setup-neon-prod.ps1  → GCP Secret rmbsale-database-url（rmbsale-prod）
#
# 若仍要執行舊流程，請明確加上 -ForceLegacy

param(
  [switch]$ForceLegacy,
  [string]$ApiKey = $env:NEON_API_KEY,
  [string]$ProjectName = "rmbsale-shared"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $ForceLegacy) {
  throw @"
此腳本已棄用（曾造成測試資料寫入正式庫）。

請改用：
  scripts\setup-neon-dev.ps1    # 本機測試 rmbsale-dev → .env.local
  scripts\setup-neon-prod.ps1 # 正式 rmbsale-prod → GCP Secret

若你確定要執行舊版，請加上 -ForceLegacy
"@
}

if (-not $ApiKey) {
  throw "請設定 `$env:NEON_API_KEY"
}

Write-Host "⚠ ForceLegacy：執行舊版 setup-neon-b（不建議）" -ForegroundColor Red

$neon = "npx.cmd --yes neonctl@latest"
$vercel = "npx.cmd --yes vercel@latest"

$orgsJson = & cmd /c "$neon orgs list --api-key `"$ApiKey`" --output json" | Out-String
$orgs = $orgsJson | ConvertFrom-Json
$orgId = $orgs[0].id

$existing = & cmd /c "$neon projects list --api-key `"$ApiKey`" --org-id `"$orgId`" --output json" | Out-String | ConvertFrom-Json
if (-not ($existing | Where-Object { $_.name -eq $ProjectName })) {
  & cmd /c "$neon projects create --name `"$ProjectName`" --org-id `"$orgId`" --api-key `"$ApiKey`" --output json"
}

$dbUrl = (& cmd /c "$neon connection-string `"$ProjectName`" --org-id `"$orgId`" --api-key `"$ApiKey`" --pooled" | Out-String).Trim()
if (-not $dbUrl -or $dbUrl -notmatch "^postgres") { throw "無法取得 DATABASE_URL" }

Write-Host "⚠ 僅寫入 Vercel production（不再寫 preview / development）" -ForegroundColor Yellow
& cmd /c "$vercel whoami" | Out-Null
if (-not (Test-Path ".vercel\project.json")) { & cmd /c "$vercel link --yes" | Out-Null }
& cmd /c "$vercel env add DATABASE_URL production --yes --sensitive --value `"$dbUrl`""

Write-Host "本機測試請用 setup-neon-dev.ps1，勿使用此連線字串。" -ForegroundColor Yellow
