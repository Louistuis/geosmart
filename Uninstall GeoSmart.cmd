@echo off
rem Double-click to remove GeoSmart and restore the original GeoGebra files.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch.ps1" -Restore %*
echo.
pause
