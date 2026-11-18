# GeoSmart setup for Windows: adds Claude to your installed GeoGebra Classic 6.
#
#   Install:    irm https://gs.lou15.com | iex
#   Uninstall:  irm https://gs.lou15.com/uninstall | iex
#
# Downloads the latest release from github.com/Louistuis/geosmart and runs its
# patch.ps1. No admin rights needed for the usual per-user GeoGebra install.
# Everything sits inside one script block so a partly downloaded script never runs.

& {
    $Mode = 'install'
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $Zip = 'https://github.com/Louistuis/geosmart/releases/latest/download/GeoSmart-Windows.zip'

    function Step($t) { Write-Host '* ' -ForegroundColor Magenta -NoNewline; Write-Host $t }
    function Fail($t) { Write-Host ('x ' + $t) -ForegroundColor Red; throw 'GeoSmart setup stopped.' }

    Write-Host ''
    Write-Host 'GeoSmart' -NoNewline; Write-Host '  Claude inside GeoGebra' -ForegroundColor DarkGray
    Write-Host ''

    if (Get-Process -Name 'GeoGebra' -ErrorAction SilentlyContinue) {
        Step 'GeoGebra is open and has to close first. If it has unsaved work it will ask you to save.'
        Read-Host '  Press Enter to close it, or Ctrl+C to stop' | Out-Null
        Get-Process -Name 'GeoGebra' -ErrorAction SilentlyContinue | ForEach-Object { [void]$_.CloseMainWindow() }
        for ($i = 0; $i -lt 180 -and (Get-Process -Name 'GeoGebra' -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Seconds 1 }
        if (Get-Process -Name 'GeoGebra' -ErrorAction SilentlyContinue) { Fail 'GeoGebra is still open. Close it, then run this again.' }
    }

    $Tmp = Join-Path ([IO.Path]::GetTempPath()) ('geosmart-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $Tmp | Out-Null
    try {
        Step 'Downloading GeoSmart'
        try { Invoke-WebRequest -Uri $Zip -OutFile (Join-Path $Tmp 'geosmart.zip') -UseBasicParsing }
        catch { Fail 'Download failed. Check your connection and try again.' }
        Expand-Archive -LiteralPath (Join-Path $Tmp 'geosmart.zip') -DestinationPath $Tmp -Force
        $Dir = Join-Path $Tmp 'GeoSmart'
        Step ('Version ' + (Get-Content -LiteralPath (Join-Path $Dir 'VERSION') -Raw).Trim())
        $PatchArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Dir 'patch.ps1'))
        if ($Mode -eq 'uninstall') { $PatchArgs += '-Restore' }
        & powershell.exe @PatchArgs
        if ($LASTEXITCODE -ne 0) { Fail 'The patch did not finish. See the message above.' }
        Write-Host ''
        if ($Mode -eq 'uninstall') {
            Write-Host 'GeoSmart removed. GeoGebra is back to its original files.' -ForegroundColor Green
        } else {
            Write-Host 'GeoSmart is installed.' -ForegroundColor Green
            Write-Host '  Open GeoGebra, press Ctrl+, and paste your Anthropic API key (console.anthropic.com).'
            Write-Host '  After GeoGebra updates itself, run this again.' -ForegroundColor DarkGray
        }
        Write-Host ''
    } finally {
        Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
