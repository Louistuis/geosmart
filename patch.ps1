# GeoSmart for Windows: add Claude to your installed GeoGebra Classic 6.
#
#   .\patch.ps1                      patch every GeoGebra Classic 6 found for this user
#   .\patch.ps1 -Restore             put the original files back
#   .\patch.ps1 -Path "D:\GeoGebra"  patch a portable or custom install (folder with GeoGebra.exe)
#
# Safe to re-run, e.g. after GeoGebra updated itself (each update is a new app-x.y.z folder).
param(
    [string]$Path,
    [switch]$Restore
)
$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-GeoGebra {
    $found = @()
    if ($Path) {
        $p = (Resolve-Path -LiteralPath $Path).Path
        if (Test-Path -LiteralPath (Join-Path $p 'GeoGebra.exe')) { $found += $p }
        elseif (Test-Path -LiteralPath (Join-Path $p 'resources\app\main.js')) { $found += $p }
        else { throw "No GeoGebra.exe in $p" }
        return $found
    }
    $roots = @()
    if ($env:LOCALAPPDATA) { $roots += (Join-Path $env:LOCALAPPDATA 'GeoGebra_6') }
    if ($env:ProgramFiles) { $roots += (Join-Path $env:ProgramFiles 'GeoGebra Classic 6') }
    if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'GeoGebra Classic 6') }
    foreach ($r in $roots) {
        if (-not (Test-Path -LiteralPath $r)) { continue }
        if (Test-Path -LiteralPath (Join-Path $r 'GeoGebra.exe')) { $found += $r }
        Get-ChildItem -LiteralPath $r -Directory -Filter 'app-*' -ErrorAction SilentlyContinue |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'GeoGebra.exe') } |
            ForEach-Object { $found += $_.FullName }
    }
    return $found
}

$targets = @(Find-GeoGebra)
if ($targets.Count -eq 0) {
    Write-Host "GeoGebra Classic 6 was not found. Install it from https://www.geogebra.org/download, or pass -Path <folder with GeoGebra.exe>."
    Write-Host "(The Microsoft Store version cannot be patched.)"
    exit 1
}
if (Get-Process -Name 'GeoGebra' -ErrorAction SilentlyContinue) {
    Write-Host "Close GeoGebra first, then run this again."
    exit 1
}

$failed = 0
foreach ($dir in $targets) {
    $exe = Join-Path $dir 'GeoGebra.exe'
    $app = Join-Path $dir 'resources\app'
    $result = Join-Path $env:TEMP ("geosmart-" + [guid]::NewGuid().ToString() + ".json")
    $patcher = Join-Path $Here 'patcher\patch.js'
    if ($Restore) { $argList = "`"$patcher`" restore `"$app`" `"$result`"" }
    else { $argList = "`"$patcher`" apply `"$app`" `"$Here`" `"$result`"" }

    # GeoGebra's own Electron runs the patcher as Node. It is a GUI program,
    # so wait for it and read the result file instead of console output.
    $env:ELECTRON_RUN_AS_NODE = '1'
    try {
        $p = Start-Process -FilePath $exe -ArgumentList $argList -Wait -PassThru -WindowStyle Hidden
    } finally {
        Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $result) {
        $r = Get-Content -LiteralPath $result -Raw | ConvertFrom-Json
        Remove-Item -LiteralPath $result -ErrorAction SilentlyContinue
        if ($r.ok) { Write-Host $r.message } else { Write-Host ("Failed: " + $r.message); $failed++ }
    } else {
        Write-Host "Failed: the patcher did not run for $dir (exit code $($p.ExitCode)). If GeoGebra is installed for all users, run this as administrator."
        $failed++
    }
}

if ($failed -eq 0 -and -not $Restore) {
    Write-Host ""
    Write-Host "Done. Open GeoGebra and press Ctrl+, to add your Anthropic API key."
    Write-Host "When GeoGebra updates itself, run this again."
}
exit $failed
