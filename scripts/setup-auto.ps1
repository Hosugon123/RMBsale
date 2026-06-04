# 一鍵線上設定（不需 Neon API Key）
# 透過 Vercel Marketplace 建立 Neon，再 migrate / seed / 寫入 JWT 等
# 用法：.\scripts\run-setup-auto.cmd

param(
  [string]$DbName = "rmbsale-shared",
  [string]$Region = "sin1",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$vercel = "npx.cmd --yes vercel@latest"

function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

function Invoke-VercelEnvAdd($name, $value, $sensitive = $true) {
  foreach ($env in @("production", "preview", "development")) {
    $args = @("env", "add", $name, $env, "--yes", "--value", $value)
    if ($sensitive) { $args += "--sensitive" }
    & cmd /c "$vercel $($args -join ' ')" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $args += "--force"
      & cmd /c "$vercel $($args -join ' ')" | Out-Null
    }
  }
}

function Test-HasDatabaseUrl {
  if ($env:DATABASE_URL) { return $true }
  foreach ($file in @(".env", ".env.local", ".env.production")) {
    if ((Test-Path $file) -and (Select-String -Path $file -Pattern '^\s*DATABASE_URL\s*=' -Quiet)) {
      return $true
    }
  }
  return $false
}

function Ensure-NeonViaVercel {
  if (Test-HasDatabaseUrl) {
    Write-Host "已有 DATABASE_URL，略過 Neon 建立" -ForegroundColor DarkGray
    return
  }

  Write-Step "透過 Vercel 安裝 Neon（免 API Key）"
  $neonArgs = @(
    "integration", "add", "neon",
    "--name", $DbName,
    "--plan", "free_v3",
    "-m", "region=$Region",
    "-m", "auth=false",
    "-e", "production", "-e", "preview", "-e", "development",
    "--non-interactive"
  )
  $out = & cmd /c "$vercel $($neonArgs -join ' ')" 2>&1 | Out-String

  if ($out -match "integration_terms_acceptance_required" -or $out -match "verification_uri") {
    if ($out -match '"verification_uri":\s*"([^"]+)"') {
      $uri = $Matches[1]
    } else {
      $uri = "https://vercel.com/~/integrations/accept-terms/neon?source=cli"
    }
    Write-Host @"

【需要你在瀏覽器按一次同意】（僅此一次，之後全自動）

已嘗試開啟：$uri

請在瀏覽器登入 Vercel → 勾選同意 Neon 條款 → 完成後回到此視窗。

"@ -ForegroundColor Yellow
    Start-Process $uri | Out-Null

    $maxWait = 300
    $elapsed = 0
    while ($elapsed -lt $maxWait) {
      Start-Sleep -Seconds 5
      $elapsed += 5
      Write-Host "等待條款同意… ($elapsed 秒)" -ForegroundColor DarkGray
      $retry = & cmd /c "$vercel $($neonArgs -join ' ')" 2>&1 | Out-String
      if ($retry -notmatch "integration_terms_acceptance_required" -and $retry -notmatch "userActionRequired") {
        if ($retry -match "error|Error|failed") {
          if ($retry -notmatch "already") { Write-Host $retry }
        }
        if (Test-HasDatabaseUrl) { return }
        break
      }
    }
  }

  & cmd /c "$vercel env pull .env --environment=production --yes" | Out-Null
  Get-Content .env -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim().Trim('"')
      if (-not (Get-Item -Path "env:$k" -ErrorAction SilentlyContinue)) {
        Set-Item -Path "env:$k" -Value $v
      }
    }
  }
}

Write-Step "Vercel 登入與專案連結"
& cmd /c "$vercel whoami" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "請先執行：npx vercel login" }
if (-not (Test-Path ".vercel\project.json")) {
  & cmd /c "$vercel link --yes" | Out-Null
}

Ensure-NeonViaVercel

if (-not $env:DATABASE_URL) {
  & cmd /c "$vercel env pull .env --environment=production --yes" | Out-Null
  Get-Content .env -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim().Trim('"')
      Set-Item -Path "env:$k" -Value $v -Force
    }
  }
}
if (-not $env:DATABASE_URL) {
  throw "仍無 DATABASE_URL。請在瀏覽器完成 Neon 條款同意後，再執行一次 .\scripts\run-setup-auto.cmd"
}

Write-Step "資料庫 migration"
npm.cmd install --no-fund --no-audit | Out-Null
npm.cmd run db:migrate

Write-Step "寫入 JWT 與帳號（Vercel + 資料庫）"
& cmd /c "npx.cmd tsx scripts/finish-vercel-env.ts"

if (-not $SkipDeploy) {
  Write-Step "部署正式版"
  & cmd /c "$vercel --prod --yes"
}

Write-Host @"

========================================
自動設定完成

管理員帳密見：scripts\.setup-result.txt
操作員：operator / operator123

正式網址請到 Vercel 專案 dsrmb-sys 查看，夥伴用 /login 登入。

========================================
"@ -ForegroundColor Green
