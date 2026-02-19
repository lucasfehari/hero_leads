@echo off
echo Fechando Google Chrome aberto...
taskkill /F /IM chrome.exe /T >nul 2>&1

echo.
echo Abrindo Google Chrome em MODO ROBO (Remote Debugging)...
echo.
echo NAO FECHE ESSA JANELA PRETA!
echo NAO FECHE O CHROME QUE VAI ABRIR!
echo.


set "PROFILE_NAME=%~1"
if "%PROFILE_NAME%"=="" set "PROFILE_NAME=default"

set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" (
    set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

echo Iniciando Chrome com Perfil: %PROFILE_NAME%
"%CHROME_PATH%" --remote-debugging-port=9222 --user-data-dir="C:\Users\%USERNAME%\.chrome_robo_profiles\%PROFILE_NAME%"

pause
