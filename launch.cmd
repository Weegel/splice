@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting Splinterlands PvE Studio...
call npm start -- --open

if errorlevel 1 (
  echo.
  echo The application stopped with an error.
  pause
)

endlocal