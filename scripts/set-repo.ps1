# Replace the YOUR_GITHUB_USER placeholder with a real GitHub owner/repo.
#
#   powershell -File .\scripts\set-repo.ps1 -Owner yourname
#   powershell -File .\scripts\set-repo.ps1 -Owner yourname -Repo AI-QR-code-scanning-
#
# Updates package.json / README / CHANGELOG. ASCII-only on purpose:
# Windows PowerShell 5.1 reads BOM-less UTF-8 scripts as ANSI, and the data files
# are UTF-8 with Chinese text, so everything here goes through .NET APIs.
param(
    [Parameter(Mandatory = $true)][string]$Owner,
    [string]$Repo = "AI-QR-code-scanning-"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$url = "https://github.com/$Owner/$Repo"
$utf8 = New-Object System.Text.UTF8Encoding($false)

$files = Get-ChildItem -Path $root -Recurse -File | Where-Object {
    ($_.Extension -in ".md", ".json") -and
    ($_.FullName -notmatch "node_modules") -and
    ($_.Name -ne "package-lock.json")
}

$updated = 0
foreach ($file in $files) {
    $text = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    if (-not $text.Contains("YOUR_GITHUB_USER")) { continue }
    $next = $text.Replace("YOUR_GITHUB_USER/$Repo", "$Owner/$Repo").Replace("YOUR_GITHUB_USER", $Owner)
    [System.IO.File]::WriteAllText($file.FullName, $next, $utf8)
    Write-Host "updated $($file.FullName)"
    $updated++
}

if ($updated -eq 0) {
    Write-Host "No YOUR_GITHUB_USER placeholder found (already configured?)."
} else {
    Write-Host ""
    Write-Host "Repository set to $url ($updated files updated)"
}

Write-Host ""
Write-Host "Next:"
Write-Host "  git add -A; git commit -m 'chore: point package metadata at the real repo'"
Write-Host "  git remote add origin $url.git"
Write-Host "  git push -u origin main --tags"
