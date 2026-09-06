[CmdletBinding()]
param(
    [string]$Message,
    [switch]$NoPush
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$expectedRemote = 'git@github.com:wandererpg/NatsumeMusic.git'

Set-Location -LiteralPath $projectRoot

$actualRemote = (& git remote get-url origin 2>$null).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Git remote origin is not configured.'
}

if ($actualRemote -ne $expectedRemote) {
    throw "Unexpected origin '$actualRemote'. Expected '$expectedRemote'."
}

$changes = @(git status --porcelain)
if ($changes.Count -eq 0) {
    Write-Host 'No local changes to commit.'
    if (-not $NoPush) {
        git push origin HEAD:main
    }
    exit 0
}

git add -A

Write-Host 'Files prepared for commit:'
git status --short

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "chore: sync local changes $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

git commit --message $Message

if (-not $NoPush) {
    git push origin HEAD:main
}
