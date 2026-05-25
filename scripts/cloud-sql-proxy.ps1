# Cloud SQL Auth Proxy for local development (Windows)
# Connection: minea-a1d4c:us-central1:minea-a1d4c-2-instance

$ErrorActionPreference = "Stop"

$ConnectionName = "minea-a1d4c:us-central1:minea-a1d4c-2-instance"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProxyPath = Join-Path $ScriptDir "cloud-sql-proxy.exe"
$ProxyUrl = "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.22.0/cloud-sql-proxy.x64.exe"

if (-not (Test-Path $ProxyPath)) {
  Write-Host "Downloading Cloud SQL Auth Proxy..."
  Invoke-WebRequest -Uri $ProxyUrl -OutFile $ProxyPath
  Write-Host "Saved to $ProxyPath"
}

Write-Host ""
Write-Host "Starting proxy for $ConnectionName"
Write-Host "Postgres will be available at 127.0.0.1:5432"
Write-Host ""
Write-Host "Then set in apps/api/.env:"
Write-Host "  DATABASE_URL=postgresql+asyncpg://hminhas:YOUR_PASSWORD@127.0.0.1:5432/postgres"
Write-Host ""
Write-Host "Requires: gcloud auth login  &&  gcloud config set project minea-a1d4c"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

& $ProxyPath $ConnectionName
