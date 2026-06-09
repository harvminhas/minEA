# Assign or inspect org plan. Run from repo root:
#   .\scripts\set-org-plan.ps1 -Org edomains-inc -Show
#   .\scripts\set-org-plan.ps1 -Org acme-corp -Plan business -Contributors 15

param(
    [Parameter(Mandatory = $true)]
    [string]$Org,

    [ValidateSet("free", "business")]
    [string]$Plan,

    [int]$Contributors,
    [switch]$Show,
    [switch]$DryRun
)

$apiRoot = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") "apps") "api"
$script = Join-Path (Join-Path $apiRoot "scripts") "set_org_plan.py"

$args = @("--org", $Org)
if ($Show) { $args += "--show" }
if ($Plan) { $args += @("--plan", $Plan) }
if ($Contributors) { $args += @("--contributors", $Contributors) }
if ($DryRun) { $args += "--dry-run" }

if (-not $Show -and -not $Plan) {
    Write-Error "Pass -Show and/or -Plan"
    exit 1
}

Push-Location $apiRoot
try {
    python $script @args
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
