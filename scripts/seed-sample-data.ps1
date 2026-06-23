# Seed demo data into a workspace. Run from repo root:
#   .\scripts\seed-sample-data.ps1 -Org acme-edomains
#   .\scripts\seed-sample-data.ps1 -Org acme-edomains -Workspace default -DryRun

param(
    [Parameter(Mandatory = $true)]
    [string]$Org,

    [string]$Workspace = "default",
    [switch]$DryRun,
    [switch]$Force
)

$apiRoot = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") "apps") "api"
$script = Join-Path (Join-Path $apiRoot "scripts") "seed_sample_data.py"

$args = @("--org", $Org, "--workspace", $Workspace)
if ($DryRun) { $args += "--dry-run" }
if ($Force) { $args += "--force" }

Push-Location $apiRoot
try {
    python $script @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
