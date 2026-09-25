@echo off
cd /d "%~dp0"
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell est introuvable.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\launch-quick-tunnel.ps1"
if errorlevel 1 echo Le lancement a echoue. Consultez le message ci-dessus.
pause
