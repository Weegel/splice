@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo First launch: downloading the private Node.js runtime...
  if not exist "runtime" mkdir "runtime"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$version='v22.14.0'; $zip=Join-Path $env:TEMP ('node-' + $version + '-win-x64.zip'); Invoke-WebRequest -Uri ('https://nodejs.org/dist/' + $version + '/node-' + $version + '-win-x64.zip') -OutFile $zip; Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force; Copy-Item (Join-Path $env:TEMP ('node-' + $version + '-win-x64\node.exe')) (Join-Path (Get-Location) 'runtime\node.exe') -Force; Remove-Item $zip -Force"
  if errorlevel 1 (
    echo.
    echo Could not download the private runtime. Check your internet connection.
    pause
    exit /b 1
  )
)
if not exist "dist\index.html" (
  echo Application files are missing. Please use the complete package.
  pause
  exit /b 1
)
runtime\node.exe server.mjs
pause
endlocal
