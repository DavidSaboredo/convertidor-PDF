@echo off
REM Convertidor PDF a Excel - Modo desarrollo

cd /d "%~dp0"

if not exist "node_modules" (
    echo.
    echo [INSTALANDO] Dependencias necesarias...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Fallo la instalacion de dependencias.
        pause
        exit /b 1
    )
)

echo.
echo [INICIANDO] Aplicacion en modo desarrollo...
echo.

call npm start
