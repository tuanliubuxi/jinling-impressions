@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 exit /b 1

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Install Node.js 22.16 or newer, then restart this terminal.
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available. Check your Node.js installation.
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||a===22&&b>=16?0:1)"
if errorlevel 1 (
  echo [ERROR] Node.js 22.16 or newer is required.
  exit /b 1
)

if not defined JINLING_PORT set "JINLING_PORT=3000"
node -e "const p=process.env.JINLING_PORT;process.exit(/^\d+$/.test(p)&&Number(p)>=1&&Number(p)<=65535?0:1)"
if errorlevel 1 (
  echo [ERROR] JINLING_PORT must be an integer between 1 and 65535.
  exit /b 1
)

if not exist ".env.local" (
  copy ".env.example" ".env.local" >nul
  if errorlevel 1 goto failed
  echo [INFO] Created .env.local. Set AI_API_KEY there to enable AI planning.
)
if not exist "node_modules\.bin\next.cmd" (
  echo [INFO] Installing dependencies...
  call npm.cmd ci
  if errorlevel 1 goto failed
)

echo [INFO] Building the production application...
call npm.cmd run build
if errorlevel 1 goto failed
echo [INFO] Starting http://localhost:%JINLING_PORT% - press Ctrl+C to stop.
node node_modules\next\dist\bin\next start --hostname 0.0.0.0 --port "%JINLING_PORT%"
exit /b %errorlevel%

:failed
echo [ERROR] Startup failed. Check the output above and try again.
exit /b 1
