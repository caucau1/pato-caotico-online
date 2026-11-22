@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 LTS em https://nodejs.org/ e tente novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias. Confira sua internet.
    pause
    exit /b 1
  )
)
echo Abra http://localhost:3000 no navegador. Ctrl+C encerra o servidor.
call npm.cmd start
pause
