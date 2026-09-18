@echo off
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell is required to create the portable package.
  pause
  exit /b 1
)

echo Creating Splinterlands PvE Studio portable zip...
powershell -ExecutionPolicy Bypass -File "%~dp0package-portable.ps1"

if errorlevel 1 (
  echo.
  echo Packaging failed.
  pause
  exit /b 1
)

echo.
echo Portable package created successfully:
echo %~dp0splinterlands-pve-studio-portable.zip
pause
endlocal
