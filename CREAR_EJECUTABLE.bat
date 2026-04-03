@echo off
REM Convertidor PDF a Excel - Generador de ejecutable portable

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
echo [GENERANDO] Ejecutable portable para Windows...
echo Este proceso tardara unos minutos. Por favor espera...
echo.

call npm run pack

if errorlevel 0 (
    echo.
    echo [EXITO] Aplicacion lista en: dist\win-unpacked\Convertidor PDF a Excel.exe
    echo Para iniciar usa INICIAR.bat
    echo.
    pause
) else (
    echo.
    echo [ERROR] Fallo la generacion.
    echo.
    pause
    exit /b 1
)
