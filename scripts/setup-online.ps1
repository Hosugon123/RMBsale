# RMBsale 線上環境一鍵設定
# 需求：已安裝 Node.js；第一次需完成 Vercel 瀏覽器登入
# 用法：.\scripts\setup-online.ps1
# 可選：先設定 $env:NEON_API_KEY 以自動建立 Neon 資料庫

param(
  [string]$NeonApiKey = $env:NEON_API_KEY,
  [string]$AdminUser = "admin",
  [string]$AdminPassword = "",
  [string]$JwtSecret = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$vercel = "npx.cmd --yes vercel@latest"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Invoke-VercelEnvAdd($name, $value, $sensitive = $true) {
  foreach ($env in @("production", "preview", "development")) {
    $args = @("env", "add", $name, $env, "--yes", "--value", $value)
    if ($sensitive) { $args += "--sensitive" }
    & cmd /c "$vercel $($args -join ' ')"
    if ($LASTEXITCODE -ne 0) {
      $args += "--force"
      & cmd /c "$vercel $($args -join ' ')"
    }
    if ($LASTEXITCODE -ne 0) { throw "vercel env add $name ($env) 失敗" }
  }
}

function Test-HasDatabaseUrl {
  if ($env:DATABASE_URL) { return $true }
  foreach ($file in @(".env", ".env.production")) {
    if ((Test-Path $file) -and (Select-String -Path $file -Pattern '^\s*DATABASE_URL\s*=' -Quiet)) {
      return $true
    }
  }
  return $false
}

Write-Step "安裝依賴"
npm.cmd install --no-fund --no-audit | Out-Null

Write-Step "Vercel 登入確認"
& cmd /c "$vercel whoami"
if ($LASTEXITCODE -ne 0) { throw "請先執行：npx vercel login" }

if (-not (Test-Path ".vercel\project.json")) {
  Write-Step "連結 Vercel 專案 dsrmb-sys"
  & cmd /c "$vercel link --yes"
}

if (-not $JwtSecret) {
  $JwtSecret = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
}
if (-not $AdminPassword) {
  $AdminPassword = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
}

Write-Step "寫入 Vercel 環境變數（JWT、管理員帳密）"
$envList = & cmd /c "$vercel env ls" 2>&1 | Out-String
if ($envList -notmatch "JWT_SECRET") { Invoke-VercelEnvAdd "JWT_SECRET" $JwtSecret }
if ($envList -notmatch "ADMIN_USERNAME") { Invoke-VercelEnvAdd "ADMIN_USERNAME" $AdminUser $false }
if ($envList -notmatch "ADMIN_PASSWORD") { Invoke-VercelEnvAdd "ADMIN_PASSWORD" $AdminPassword }
if ($envList -notmatch "OPERATOR_USERNAME") { Invoke-VercelEnvAdd "OPERATOR_USERNAME" "operator" $false }
if ($envList -notmatch "OPERATOR_PASSWORD") { Invoke-VercelEnvAdd "OPERATOR_PASSWORD" "operator123" }

if (-not (Test-HasDatabaseUrl)) {
  if ($NeonApiKey) {
    Write-Step "委派 setup-neon-b.ps1 建立 Neon 與 DATABASE_URL"
    & $PSScriptRoot\setup-neon-b.ps1 -ApiKey $NeonApiKey
  } else {
    Write-Host @"

【尚缺 DATABASE_URL】目前 Vercel 專案還沒有資料庫，無法全自動完成最後一步。

請二選一：

A) 圖形介面（約 1 分鐘，只需做一次）
   1. 開啟 https://vercel.com → 專案 dsrmb-sys → Storage
   2. Create Database → Neon Postgres → 建立
   3. 再執行一次：.\scripts\setup-online.ps1

B) 全 CLI（需 Neon API Key）
   1. 到 https://console.neon.tech/app/settings/api-keys 建立金鑰
   2. PowerShell：`$env:NEON_API_KEY='你的金鑰'; .\scripts\run-setup-neon-b.cmd`
   3. 再執行：`.\scripts\run-setup-online.cmd`

"@ -ForegroundColor Yellow
    throw "缺少 DATABASE_URL"
  }
}

Write-Step "拉取環境變數到本機 .env"
& cmd /c "$vercel env pull .env --environment=production --yes"
& cmd /c "$vercel env pull .env.preview --environment=preview --yes" 2>$null

# 載入 DATABASE_URL 供 migrate
Get-Content .env -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $k = $matches[1].Trim()
    $v = $matches[2].Trim().Trim('"')
    if (-not $env:$k) { Set-Item -Path "env:$k" -Value $v }
  }
}

if (-not $env:DATABASE_URL) { throw "仍無 DATABASE_URL，請完成 Neon 建立後重試" }

Write-Step "套用 migration"
npm.cmd run db:migrate

Write-Step "寫入種子資料"
$env:ADMIN_USERNAME = $AdminUser
$env:ADMIN_PASSWORD = $AdminPassword
npm.cmd run db:seed

Write-Step "部署正式版（可選）"
$deploy = Read-Host "是否立即 vercel --prod 部署？(y/N)"
if ($deploy -eq "y" -or $deploy -eq "Y") {
  & cmd /c "$vercel --prod --yes"
}

Write-Host @"

========================================
設定完成（請妥善保存，勿公開分享）

管理員帳號：$AdminUser
管理員密碼：$AdminPassword
操作員：operator / operator123

正式網址請到 Vercel 專案 dsrmb-sys 查看。
登入後全公司共用同一份 PostgreSQL 帳務資料。

========================================
"@ -ForegroundColor Green
