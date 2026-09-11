@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installer Node.js LTS depuis https://nodejs.org puis relancer ce fichier.
  pause
  exit /b 1
)
node tools\serve.cjs --open
pause
