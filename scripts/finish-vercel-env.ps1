# 寫入 JWT / 帳密到 Vercel（每個環境各加一次）
param(
  [string]$AdminPassword = "",
  [string]$JwtSecret = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $AdminPassword) {
  $AdminPassword = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
}
if (-not $JwtSecret) {
  $JwtSecret = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
}

$vercel = "npx.cmd --yes vercel@latest"

function Add-Env($name, $value, [bool]$sensitive = $true) {
  foreach ($env in @("production", "preview", "development")) {
    $sensitiveFlag = if ($sensitive) { "--sensitive" } else { "" }
    $cmd = "$vercel env add $name $env --yes --force $sensitiveFlag --value `"$value`""
    cmd /c $cmd 2>$null | Out-Null
  }
}

Add-Env "JWT_SECRET" $JwtSecret
Add-Env "ADMIN_USERNAME" "admin" $false
Add-Env "ADMIN_PASSWORD" $AdminPassword
Add-Env "OPERATOR_USERNAME" "operator" $false
Add-Env "OPERATOR_PASSWORD" "operator123"

$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = $AdminPassword
$env:OPERATOR_USERNAME = "operator"
$env:OPERATOR_PASSWORD = "operator123"
npm.cmd run db:seed 2>&1 | Out-Null

@"
登入資訊（請妥善保存，勿公開）

管理員：admin / $AdminPassword
操作員：operator / operator123

"@ | Set-Content -Encoding utf8 "scripts\.setup-result.txt"

Write-Host "已寫入 Vercel 環境變數，帳密見 scripts\.setup-result.txt" -ForegroundColor Green
