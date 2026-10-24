# Install / uninstall dsh-qr-scanner into a DSH profile.
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -ProfileDir "C:\Users\me\.dsh\profiles\web"
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Uninstall
#
# The plugin is copied (with its dependencies) into <profile>\node_modules\dsh-qr-scanner
# and registered in <profile>\cordis.patch.yml between marker comments, so re-running
# the script is idempotent.
param(
    [string]$ProfileDir = (Join-Path $env:USERPROFILE ".dsh\profiles\desktop"),
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $ProfileDir "node_modules\dsh-qr-scanner"
$patchFile = Join-Path $ProfileDir "cordis.patch.yml"
$beginMarker = "# >>> dsh-qr-scanner (managed block, do not edit)"
$endMarker = "# <<< dsh-qr-scanner"

function Remove-ManagedBlock([string]$text) {
    $pattern = "(?ms)^" + [regex]::Escape($beginMarker) + ".*?" + [regex]::Escape($endMarker) + "\r?\n?"
    return [regex]::Replace($text, $pattern, "")
}

if (-not (Test-Path $ProfileDir)) {
    throw "Profile directory not found: $ProfileDir"
}

# --- uninstall -------------------------------------------------------------
if ($Uninstall) {
    if (Test-Path $patchFile) {
        $text = Get-Content $patchFile -Raw
        Set-Content -Path $patchFile -Value (Remove-ManagedBlock $text) -NoNewline -Encoding utf8
        Write-Host "Removed plugin entry from $patchFile"
    }
    if (Test-Path $target) {
        Remove-Item $target -Recurse -Force
        Write-Host "Removed $target"
    }
    Write-Host "Restart DeepSeek Harness to finish uninstalling."
    exit 0
}

# --- install ---------------------------------------------------------------
if (Test-Path $target) {
    Remove-Item $target -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
Copy-Item $packageRoot $target -Recurse -Force
Write-Host "Copied plugin to $target"

$block = @"
$beginMarker
- insert:
    - id: tool-qr-scanner
      name: dsh-qr-scanner
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
$cleaned = (Remove-ManagedBlock $current).TrimEnd()
$updated = if ($cleaned.Length -gt 0) { "$cleaned`n$block" } else { $block }
Set-Content -Path $patchFile -Value $updated -Encoding utf8
Write-Host "Registered plugin in $patchFile"

Write-Host ""
Write-Host "Done. Restart DeepSeek Harness (quit from the tray, then relaunch) to activate the tools:"
Write-Host "  qr_scan / qr_scan_screen / qr_scan_camera / qr_make"
