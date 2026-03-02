@echo off
setlocal enabledelayedexpansion
title Browze Bot — Instalação e Inicialização
color 0A
chcp 65001 >nul 2>&1

echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║                                                   ║
echo  ║          BROWZE BOT — Automation Suite            ║
echo  ║                                                   ║
echo  ╚═══════════════════════════════════════════════════╝
echo.

:: ─────────────────────────────────────────────────────────────
:: PASSO 1: Verificar Node.js
:: ─────────────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js não encontrado. Baixando e instalando...
    echo      Aguarde, isso pode levar alguns minutos.
    echo.
    powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.19.1/node-v20.19.1-x64.msi' -OutFile '%TEMP%\node_installer.msi' }"
    if not exist "%TEMP%\node_installer.msi" (
        echo  [ERRO] Não foi possível baixar o Node.js.
        echo  Acesse https://nodejs.org e instale manualmente, depois execute novamente.
        pause & exit /b 1
    )
    msiexec /i "%TEMP%\node_installer.msi" /quiet /norestart
    set "PATH=%PATH%;%ProgramFiles%\nodejs"
    node --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [!] Node.js instalado. REINICIE o computador e execute este arquivo novamente.
        pause & exit /b 1
    )
    echo  [OK] Node.js instalado com sucesso!
) else (
    for /f "tokens=*" %%v in ('node --version') do echo  [OK] Node.js: %%v
)

:: ─────────────────────────────────────────────────────────────
:: PASSO 2: Verificar e instalar Visual C++ Build Tools
::          (necessário para better-sqlite3 / node-gyp)
:: ─────────────────────────────────────────────────────────────
where cl >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Visual C++ Build Tools: ja instalado.
    goto :vc_done
)

:: Também verifica via registry (VS2019/2022 Build Tools)
reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\17.0" >nul 2>&1
if %errorlevel% equ 0 goto :vc_done
reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\16.0" >nul 2>&1
if %errorlevel% equ 0 goto :vc_done
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\SxS\VS7" >nul 2>&1
if %errorlevel% equ 0 goto :vc_done

echo.
echo  [*] Visual C++ Build Tools nao encontrado.
echo      Instalando automaticamente... (pode levar 5-10 min)
echo      O processo roda em segundo plano — aguarde!
echo.

:: ── Tenta via winget (Windows 10/11 com App Installer) ──────
winget --version >nul 2>&1
if %errorlevel% equ 0 (
    echo  [*] Usando winget para instalar Build Tools...
    winget install --id Microsoft.VisualStudio.2022.BuildTools ^
        --silent --accept-package-agreements --accept-source-agreements ^
        --override "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [OK] Visual C++ Build Tools instalado via winget!
        goto :vc_done
    )
    echo  [!] winget falhou. Tentando download direto...
)

:: ── Fallback: Download direto do instalador oficial ──────────
set "VC_INSTALLER=%TEMP%\vs_BuildTools.exe"
echo  [*] Baixando Visual C++ Build Tools (~4 MB launcher)...
powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -OutFile '%VC_INSTALLER%' }"

if not exist "%VC_INSTALLER%" (
    echo.
    echo  [ERRO] Nao foi possivel baixar o Visual C++ Build Tools.
    echo.
    echo  Instale manualmente:
    echo  1. Acesse: https://aka.ms/vs/17/release/vs_BuildTools.exe
    echo  2. Execute o instalador
    echo  3. Selecione: "Desenvolvimento para Desktop com C++"
    echo  4. Execute este arquivo novamente.
    echo.
    pause & exit /b 1
)

echo  [*] Instalando Build Tools silenciosamente (aguarde 5-10 min)...
"%VC_INSTALLER%" --quiet --wait --norestart --nocache ^
    --add Microsoft.VisualStudio.Workload.VCTools ^
    --includeRecommended

if %errorlevel% neq 0 (
    echo  [AVISO] Instalacao pode ter tido avisos. Continuando...
)
echo  [OK] Visual C++ Build Tools instalado!

:vc_done


:: ─────────────────────────────────────────────────────────────
:: PASSO 3: Instalar dependências do Backend
:: ─────────────────────────────────────────────────────────────
if not exist "%~dp0server\node_modules" (
    echo.
    echo  [*] Instalando dependencias do Backend...
    echo      (Primeira vez — pode levar 2-5 minutos)
    echo.
    cd /d "%~dp0server"
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERRO] Falha ao instalar Backend.
        echo  Se o erro mencionar "better-sqlite3" ou "node-gyp":
        echo  → Baixe Visual C++ Build Tools:
        echo    https://aka.ms/vs/17/release/vs_BuildTools.exe
        echo    Selecione: "Desenvolvimento para Desktop com C++"
        echo    Depois execute este arquivo novamente.
        echo.
        pause & exit /b 1
    )
    echo  [OK] Backend instalado!
) else (
    echo  [OK] Backend: dependencias ja instaladas.
)

:: ─────────────────────────────────────────────────────────────
:: PASSO 4: Instalar dependências do Frontend
:: ─────────────────────────────────────────────────────────────
if not exist "%~dp0client\node_modules" (
    echo.
    echo  [*] Instalando dependencias do Frontend...
    cd /d "%~dp0client"
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERRO] Falha ao instalar Frontend.
        pause & exit /b 1
    )
    echo  [OK] Frontend instalado!
) else (
    echo  [OK] Frontend: dependencias ja instaladas.
)

:: ─────────────────────────────────────────────────────────────
:: PASSO 5: Criar .env se não existir
:: ─────────────────────────────────────────────────────────────
if not exist "%~dp0server\.env" (
    if exist "%~dp0server\.env.example" (
        copy "%~dp0server\.env.example" "%~dp0server\.env" >nul
        echo  [OK] Arquivo .env criado a partir do .env.example
    )
)

:: ─────────────────────────────────────────────────────────────
:: PASSO 6: Iniciar Backend (porta 3000)
:: ─────────────────────────────────────────────────────────────
echo.
echo  [*] Iniciando Servidor Backend na porta 3000...
start "Browze Bot — Backend" cmd /k "title Browze Bot ^| Backend ^(porta 3000^) && cd /d ""%~dp0server"" && node index.js"
timeout /t 4 /nobreak >nul

:: ─────────────────────────────────────────────────────────────
:: PASSO 7: Iniciar Frontend (porta 5173)
:: ─────────────────────────────────────────────────────────────
echo  [*] Iniciando Interface na porta 5173...
start "Browze Bot — Interface" cmd /k "title Browze Bot ^| Interface ^(porta 5173^) && cd /d ""%~dp0client"" && npm run dev"
timeout /t 4 /nobreak >nul

:: ─────────────────────────────────────────────────────────────
:: PRONTO
:: ─────────────────────────────────────────────────────────────
echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║                                                   ║
echo  ║   BROWZE BOT INICIADO COM SUCESSO!                ║
echo  ║                                                   ║
echo  ║   Acesse: http://localhost:5173                   ║
echo  ║                                                   ║
echo  ║   ATENÇÃO: Não feche as janelas pretas!           ║
echo  ║                                                   ║
echo  ╚═══════════════════════════════════════════════════╝
echo.

start "" "http://localhost:5173"
pause
