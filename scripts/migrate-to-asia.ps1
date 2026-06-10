param(
  [string]$ProjectId = "plenary-shade-472603-s8",
  [string]$Region = "asia-east1",
  [string]$ServiceName = "dsrmbsys",
  [string]$DatabaseSecret = "rmbsale-database-url",
  [string]$SourceDatabaseUrl = $env:SOURCE_DATABASE_URL,
  [string]$TargetDatabaseUrl = $env:TARGET_DATABASE_URL,
  [string]$NeonApiKey = $env:NEON_API_KEY,
  [switch]$SkipDeploy,
  [switch]$SkipDbMigration
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "找不到 $name。請先安裝 Google Cloud SDK 並登入：gcloud auth login"
  }
}

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

Write-Host "東水公司：遷移到亞洲（Cloud Run 台灣 + Neon 新加坡）" -ForegroundColor Yellow
Write-Host "目前正式站若在 europe-west1，完成後網址會變成 asia-east1。" -ForegroundColor DarkGray

if (-not $SkipDbMigration) {
  if (-not $SourceDatabaseUrl) {
    throw "請先設定舊資料庫連線：`$env:SOURCE_DATABASE_URL = 'postgresql://...歐洲庫...'`"
  }

  if (-not $TargetDatabaseUrl) {
    if (-not $NeonApiKey) {
      throw "請設定 `$env:NEON_API_KEY 建立亞洲庫，或直接設定 `$env:TARGET_DATABASE_URL"
    }
    Write-Step "建立亞洲 Neon 資料庫"
    & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\setup-neon-asia.ps1" -ApiKey $NeonApiKey
    $TargetDatabaseUrl = $env:DATABASE_URL
  }

  Write-Step "從舊庫匯出快照"
  $env:DATABASE_URL = $SourceDatabaseUrl
  npm.cmd run db:export-snapshot

  Write-Step "匯入亞洲新庫"
  $env:DATABASE_URL = $TargetDatabaseUrl
  npm.cmd run db:migrate
  npm.cmd run db:import-snapshot

  Require-Command gcloud
  Write-Step "更新 Secret Manager 的 DATABASE_URL"
  $TargetDatabaseUrl | gcloud secrets versions add $DatabaseSecret --data-file=-
}

if (-not $SkipDeploy) {
  Require-Command gcloud
  Write-Step "部署 Cloud Run 到 $Region（台灣）"
  & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\deploy-cloud-run-asia.ps1" `
    -ProjectId $ProjectId `
    -Region $Region `
    -ServiceName $ServiceName `
    -DatabaseSecret $DatabaseSecret
}

Write-Host ""
Write-Host "遷移流程完成。" -ForegroundColor Green
Write-Host "請用新網址測試："
Write-Host "  gcloud run services describe $ServiceName --region $Region --format='value(status.url)'"
Write-Host "  GET /health"
Write-Host "  登入後確認帳務資料是否完整"
