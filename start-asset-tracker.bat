@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 18+ and run this launcher again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies (first run only)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if "%PORT%"=="" set PORT=3000

start "" "http://localhost:%PORT%"
echo Starting Asset Tracker at http://localhost:%PORT%
call npm start

if errorlevel 1 pause
