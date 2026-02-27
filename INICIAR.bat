@echo off
setlocal enabledelayedexpansion
title InstaProspect

echo.
echo  =====================================================
echo        InstaProspect - Sistema de Prospeccao
echo  =====================================================
echo.

:: ─────────────────────────────────────────────────────────────
:: PASSO 1: Verificar Node.js - instalar se nao tiver
:: ─────────────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js nao encontrado. Baixando e instalando...
    echo      Aguarde, isso pode levar alguns minutos.
    echo.

    powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.19.1/node-v20.19.1-x64.msi' -OutFile '%TEMP%\node_installer.msi' }"

    if not exist "%TEMP%\node_installer.msi" (
        echo  [ERRO] Nao foi possivel baixar o Node.js. Verifique sua internet.
        echo  Acesse https://nodejs.org e instale manualmente, depois execute novamente.
        pause & exit /b 1
    )

    msiexec /i "%TEMP%\node_installer.msi" /quiet /norestart
    set "PATH=%PATH%;%ProgramFiles%\nodejs"

    node --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [!] Node.js instalado. Reinicie o computador e execute este arquivo novamente.
        pause & exit /b 1
    )
    echo  [OK] Node.js instalado com sucesso!
) else (
    for /f "tokens=*" %%v in ('node --version') do echo  [OK] Node.js: %%v
)

:: ─────────────────────────────────────────────────────────────
:: PASSO 2: Instalar dependencias do Backend se precisar
:: ─────────────────────────────────────────────────────────────
if not exist "%~dp0server\node_modules" (
    echo.
    echo  [*] Instalando dependencias do Backend... (primeira vez - pode demorar)
    cd /d "%~dp0server"
    call npm install
    if %errorlevel% neq 0 (
        echo  [AVISO] Erro no Backend. Pode faltar o Visual C++ Build Tools.
        echo  Baixe em: https://aka.ms/vs/17/release/vs_BuildTools.exe
        pause & exit /b 1
    )
    echo  [OK] Backend pronto!
) else (
    echo  [OK] Backend ja instalado.
)

:: ─────────────────────────────────────────────────────────────
:: PASSO 3: Instalar dependencias do Frontend se precisar
:: ─────────────────────────────────────────────────────────────
if not exist "%~dp0client\node_modules" (
    echo.
    echo  [*] Instalando dependencias do Frontend... (primeira vez - pode demorar)
    cd /d "%~dp0client"
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERRO] Falha ao instalar Frontend.
        pause & exit /b 1
    )
    echo  [OK] Frontend pronto!
) else (
    echo  [OK] Frontend ja instalado.
)

:: ─────────────────────────────────────────────────────────────
:: PASSO 5: Iniciar Servidor Backend
:: ─────────────────────────────────────────────────────────────
echo.
echo  [*] Iniciando Servidor Backend (porta 3000)...
start "InstaProspect - Servidor" cmd /k "cd /d ""%~dp0server"" && node index.js"
timeout /t 4 /nobreak >nul

:: ─────────────────────────────────────────────────────────────
:: PASSO 6: Iniciar Frontend
:: ─────────────────────────────────────────────────────────────
echo  [*] Iniciando Interface (porta 5173)...
start "InstaProspect - Interface" cmd /k "cd /d ""%~dp0client"" && npm run dev"
timeout /t 3 /nobreak >nul

:: ─────────────────────────────────────────────────────────────
:: PRONTO
:: ─────────────────────────────────────────────────────────────
echo.
echo  =====================================================
echo   SISTEMA INICIADO! Abrindo no navegador...
echo  =====================================================
echo.
echo  Acesse: http://localhost:5173
echo.
echo  IMPORTANTE: Nao feche as janelas pretas!
echo.
start "" "http://localhost:5173"
pause
