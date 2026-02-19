@echo off
echo ==========================================
echo      INICIANDO SISTEMA DE PROSPECCAO
echo ==========================================

echo [1/2] Iniciando Servidor Backend (Porta 3000)...
start "InstaProspect - Servidor" cmd /k "cd server && node index.js"

echo Aguardando servidor iniciar...
timeout /t 3 /nobreak >nul

echo [2/2] Iniciando Frontend (Porta 5173)...
start "InstaProspect - Cliente" cmd /k "cd client && npm run dev"

echo.
echo ==========================================
echo      SISTEMA INICIADO COM SUCESSO!
echo ==========================================
echo.
echo Acesse no navegador: http://localhost:5173
echo.
pause
