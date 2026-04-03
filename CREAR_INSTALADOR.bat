@echo off
REM Convertidor PDF a Excel - Generador de instalador para distribuir
setlocal EnableDelayedExpansion

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
echo [GENERANDO] Instalador de Windows (NSIS)...
echo Este proceso puede tardar varios minutos.
echo.

call npm run dist

if errorlevel 0 (
    if not exist "build" mkdir "build"

    set "SETUP_FILE="
    for /f "delims=" %%F in ('dir /b /o:-d "dist\*Setup-*.exe"') do (
        if not defined SETUP_FILE set "SETUP_FILE=%%F"
    )

    if defined SETUP_FILE (
        copy /y "dist\!SETUP_FILE!" "build\!SETUP_FILE!" >nul
    )

    echo.
    echo [EXITO] Instalador generado correctamente.
    if defined SETUP_FILE (
        echo Copia para distribuir en: build\!SETUP_FILE!
        echo Original tambien disponible en: dist\!SETUP_FILE!
    ) else (
        echo No se encontro un archivo Setup en dist.
    )
    echo.
    pause
) else (
    echo.
    echo [ERROR] No se pudo generar el instalador.
    echo.
    pause
    exit /b 1
)
