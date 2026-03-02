@echo off
setlocal enabledelayedexpansion
title Browze Bot — Instalação e Inicialização
color 0A
chcp 65001 >nul 2>&1

echo.
echo  __________                                      
echo  \______   \_______  ______  _  __________ ____  
echo   ^|    ^|  _/\_  __ \/  _ \ \/ \/ /\___   // __ \ 
echo   ^|    ^|   \ ^|  ^| \(  ^<_^> )     /  /    /\  ___/ 
echo   ^|______  / ^|__^|   \____/ \/\_/  /_____ \\___  ^>
echo           \/                             \/    \/ 
echo.
echo                  Automation Suite v1.0
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
:: PASSO 2: Verificar Visual C++ Build Tools (se ja tiver, pula)
:: ─────────────────────────────────────────────────────────────

:: Metodo 1: vswhere.exe (presente apos qualquer instalacao do VS/BuildTools)
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%VSWHERE%" (
    "%VSWHERE%" -products * -requires Microsoft.VisualCpp.Tools.HostX64.TargetX64 -latest >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [OK] Visual C++ Build Tools: ja instalado.
        goto :vc_done
    )
)

:: Metodo 2: cl.exe no PATH
where cl >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Visual C++ Build Tools: ja instalado.
    goto :vc_done
)

:: Metodo 3: pasta padrao de instalacao do Build Tools 2022
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC" (
    echo  [OK] Visual C++ Build Tools 2022: ja instalado.
    goto :vc_done
)
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\BuildTools\VC\Tools\MSVC" (
    echo  [OK] Visual C++ Build Tools 2019: ja instalado.
    goto :vc_done
)

:: Nao encontrado — instalar automaticamente
echo.
echo  [*] Visual C++ Build Tools nao encontrado.
echo      Instalando automaticamente... (pode levar 5-10 min)
echo      O processo roda em segundo plano — aguarde!
echo.

:: Tenta via winget (Windows 10/11)
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

:: Fallback: download direto do instalador oficial
set "VC_INSTALLER=%TEMP%\vs_BuildTools.exe"
echo  [*] Baixando Visual C++ Build Tools...
powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -OutFile '%VC_INSTALLER%' }"

if not exist "%VC_INSTALLER%" (
    echo  [ERRO] Nao foi possivel baixar. Instale manualmente:
    echo  https://aka.ms/vs/17/release/vs_BuildTools.exe
    echo  Selecione: "Desenvolvimento para Desktop com C++"
    pause & exit /b 1
)

echo  [*] Instalando silenciosamente (aguarde 5-10 min)...
"%VC_INSTALLER%" --quiet --wait --norestart --nocache ^
    --add Microsoft.VisualStudio.Workload.VCTools ^
    --includeRecommended
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
