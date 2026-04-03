@echo off
REM Convertidor PDF a Excel - Modo web

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
echo [INICIANDO] Modo web en http://localhost:5173/src/web.html
echo [INFO] Presiona Ctrl+C para detener el servidor.
echo.

call npm run web
