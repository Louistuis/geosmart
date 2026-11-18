@echo off
rem Double-click to add GeoSmart (Claude) to GeoGebra Classic 6. Close GeoGebra first.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch.ps1" %*
echo.
pause
