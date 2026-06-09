param(
  [string]$ProjectId = "plenary-shade-472603-s8",
  [string]$Region = "asia-east1",
  [string]$ServiceName = "dsrmbsys",
  [string]$Repository = "rmbsale",
  [string]$ImageName = "app",
  [string]$DatabaseSecret = "rmbsale-database-url",
  [string]$JwtSecret = "rmbsale-jwt-secret"
)

$ErrorActionPreference = "Stop"

function Run($Command, [string[]]$Args) {
  Write-Host ">>> $Command $($Args -join ' ')" -ForegroundColor Cyan
  & $Command @Args
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($Args -join ' ')"
  }
}

$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/$ImageName`:latest"

Run "gcloud" @("config", "set", "project", $ProjectId)
Run "gcloud" @("config", "set", "run/region", $Region)
Run "gcloud" @("services", "enable", "run.googleapis.com", "artifactregistry.googleapis.com", "cloudbuild.googleapis.com", "secretmanager.googleapis.com")

$repos = & gcloud artifacts repositories list --location $Region --format "value(name)"
if ($LASTEXITCODE -ne 0) {
  throw "Unable to list Artifact Registry repositories."
}
if ($repos -notcontains $Repository) {
  Run "gcloud" @(
    "artifacts", "repositories", "create", $Repository,
    "--repository-format=docker",
    "--location=$Region",
    "--description=RMBsale app images"
  )
}

Run "gcloud" @("builds", "submit", "--tag", $image)
Run "gcloud" @(
  "run", "deploy", $ServiceName,
  "--image", $image,
  "--platform", "managed",
  "--region", $Region,
  "--allow-unauthenticated",
  "--port", "8080",
  "--memory", "1Gi",
  "--cpu", "1",
  "--min-instances", "1",
  "--max-instances", "20",
  "--set-env-vars", "NODE_ENV=production,RUN_STARTUP_DB_MAINTENANCE=0,BACKUP_STORAGE=gcs",
  "--set-secrets", "DATABASE_URL=$DatabaseSecret`:latest,JWT_SECRET=$JwtSecret`:latest"
)

Write-Host ""
Write-Host "Asia Cloud Run deploy complete." -ForegroundColor Green
Write-Host "Region: $Region"
Write-Host "Service: $ServiceName"
