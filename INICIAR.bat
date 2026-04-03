@echo off
REM Convertidor PDF a Excel - Script de inicio

cd /d "%~dp0"

REM Primero intenta el ejecutable en la carpeta desempaquetada (sin antivirus bloqueante)
set "EXECUTABLE=dist\win-unpacked\Convertidor PDF a Excel.exe"

if not exist "%EXECUTABLE%" (
    echo.
    echo [ERROR] No se encontro el ejecutable.
    echo Abre una terminal en esta carpeta y ejecuta: npm run pack
    echo.
    pause
    exit /b 1
)

start "" "%EXECUTABLE%"
exit /b 0
