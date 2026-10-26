@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo Application files are missing. Please use the complete package.
  pause
  exit /b 1
)
if not exist "runtime\node.exe" (
  echo First launch: downloading the private Node.js runtime...
  if not exist "runtime" mkdir "runtime"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $version='v22.14.0'; $expected='55b639295920b219bb2acbcfa00f90393a2789095b7323f79475c9f34795f217'; $zip=Join-Path $env:TEMP ('node-' + $version + '-win-x64.zip'); $uri='https://nodejs.org/dist/' + $version + '/node-' + $version + '-win-x64.zip'; try { Invoke-WebRequest -Uri $uri -OutFile $zip } catch { throw ('Runtime download failed from ' + $uri + '. To install offline, place node.exe in the runtime folder. ' + $_.Exception.Message) }; $actual=(Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLowerInvariant(); if ($actual -ne $expected) { Remove-Item $zip -Force -ErrorAction SilentlyContinue; throw ('Runtime checksum mismatch. Expected ' + $expected + ' but received ' + $actual) }; Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force; Copy-Item (Join-Path $env:TEMP ('node-' + $version + '-win-x64\node.exe')) (Join-Path (Get-Location) 'runtime\node.exe') -Force; Remove-Item $zip -Force"
  if errorlevel 1 (
    echo.
    echo Could not install the private runtime. See the error above.
    echo Offline setup: place a trusted Windows x64 node.exe at runtime\node.exe and launch again.
    pause
    exit /b 1
  )
)
runtime\node.exe server.mjs
pause
endlocal
