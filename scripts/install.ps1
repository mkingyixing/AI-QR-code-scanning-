# Install / uninstall the plugin into a DSH profile.
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -ProfileDir "C:\Users\me\.dsh\profiles\web"
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Uninstall
#
# The package is copied (with its dependencies) into <profile>\node_modules\<package name>
# and registered in <profile>\cordis.patch.yml between marker comments, so re-running
# the script is idempotent. The name is read from package.json, never hardcoded.
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less UTF-8 scripts as ANSI.
param(
    [string]$ProfileDir = (Join-Path $env:USERPROFILE ".dsh\profiles\desktop"),
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $packageRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$pluginName = $manifest.name

$target = Join-Path $ProfileDir "node_modules\$pluginName"
$patchFile = Join-Path $ProfileDir "cordis.patch.yml"
$beginMarker = "# >>> $pluginName (managed block, do not edit)"
$endMarker = "# <<< $pluginName"

# Older releases used a different package name; clean those up too.
$legacyNames = @("dsh-qr-scanner")
$legacyBlocks = @()
foreach ($legacy in $legacyNames) {
    $legacyBlocks += @{ Begin = "# >>> $legacy (managed block, do not edit)"; End = "# <<< $legacy" }
}

function Remove-Block([string]$text, [string]$begin, [string]$end) {
    $pattern = "(?ms)^" + [regex]::Escape($begin) + ".*?" + [regex]::Escape($end) + "\r?\n?"
    return [regex]::Replace($text, $pattern, "")
}

function Remove-AllBlocks([string]$text) {
    $next = Remove-Block $text $beginMarker $endMarker
    foreach ($block in $legacyBlocks) {
        $next = Remove-Block $next $block.Begin $block.End
    }
    return $next
}

if (-not (Test-Path $ProfileDir)) {
    throw "Profile directory not found: $ProfileDir"
}

if ($Uninstall) {
    if (Test-Path $patchFile) {
        $text = Get-Content $patchFile -Raw
        Set-Content -Path $patchFile -Value (Remove-AllBlocks $text) -NoNewline -Encoding utf8
        Write-Host "Removed plugin entry from $patchFile"
    }
    foreach ($name in @($pluginName) + $legacyNames) {
        $dir = Join-Path $ProfileDir "node_modules\$name"
        if (Test-Path $dir) {
            Remove-Item $dir -Recurse -Force
            Write-Host "Removed $dir"
        }
    }
    Write-Host "Restart DeepSeek Harness to finish uninstalling."
    exit 0
}

if (Test-Path $target) {
    Remove-Item $target -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
Copy-Item $packageRoot $target -Recurse -Force
foreach ($junk in @(".git", ".npm-cache")) {
    $path = Join-Path $target $junk
    if (Test-Path $path) { Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Host "Copied plugin to $target"

$block = @"
$beginMarker
- insert:
    - id: tool-qr-scanner
      name: $pluginName
      config:
        outputDir: .dsh-qr
        maxInputBytes: 20971520
        timeoutMs: 20000
$endMarker
"@

if (Test-Path $patchFile) {
    $backup = "$patchFile.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item $patchFile $backup -Force
    Write-Host "Backed up patch file to $backup"
}
$current = if (Test-Path $patchFile) { Get-Content $patchFile -Raw } else { "" }
$cleaned = (Remove-AllBlocks $current).TrimEnd()
$updated = if ($cleaned.Length -gt 0) { "$cleaned`n$block" } else { $block }
Set-Content -Path $patchFile -Value $updated -Encoding utf8
Write-Host "Registered plugin in $patchFile"

Write-Host ""
Write-Host "Done. Restart DeepSeek Harness (or touch the patch file) to activate:"
Write-Host "  qr_scan / qr_scan_screen / qr_scan_camera / qr_make"
