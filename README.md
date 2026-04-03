# Convertidor PDF a Excel

Aplicacion de escritorio para Windows orientada a trabajo y estudio.

Permite convertir datos desde PDF a formatos listos para Excel con dos modos:

- Extraccion directa para PDF con texto seleccionable.
- OCR automatico para PDF escaneado (imagen).

Tambien incluye opcion web para usar en navegador en cualquier equipo.

## Caracteristicas

- Carga de PDF desde dialogo nativo de Windows.
- Limpieza de texto por lineas.
- Deteccion de filas con esquema `CODIGO - DESCRIPCION - STOCK`.
- Exportacion a `TXT`, `CSV`, `XLSX` y `Word (.doc)`.
- App portable y tambien instalador para distribuir.
- Icono personalizado generado desde `logo.png`.

## Requisitos

- Windows 10/11 recomendado.
- Node.js 20+ (solo para desarrollo/build).

## Ejecutar en desarrollo

```powershell
npm install
npm start
```

Atajos disponibles:

- `INICIAR_DEV.bat`

## Ejecutar opcion web

```powershell
npm install
npm run web
```

Luego abrir en navegador:

- `http://localhost:5173/src/web.html`

Atajo disponible:

- `INICIAR_WEB.bat`

Notas del modo web:

- No requiere instalacion de Electron en la PC cliente.
- Exporta usando descarga del navegador.
- OCR se ejecuta en el navegador con `tesseract.js`.
- Para OCR en web se recomienda tener internet para descargar datos de idioma al primer uso.
- En produccion web (Vercel) se usan CDN para `pdfjs`, `xlsx` y `tesseract`.

## Subir a GitHub

Repositorio remoto:

- `git@github.com:DavidSaboredo/convertidor-PDF.git`

Comandos sugeridos:

```powershell
git init
git add .
git commit -m "feat: web + desktop pdf converter with excel and word export"
git branch -M main
git remote add origin git@github.com:DavidSaboredo/convertidor-PDF.git
git push -u origin main
```

## Deploy en Vercel

Este repo ya incluye `vercel.json` para abrir directamente la web en `/src/web.html`.

Opciones:

1) Dashboard Vercel

- Importar repo de GitHub.
- Framework preset: `Other`.
- Build Command: vacio.
- Output Directory: vacio.
- Deploy.

2) CLI

```powershell
npm i -g vercel
vercel
vercel --prod
```

## Generar builds

### 1) Build carpeta (sin instalador)

```powershell
npm run pack
```

Salida principal:

- `dist/win-unpacked/Convertidor PDF a Excel.exe`

### 2) Instalador para distribuir

```powershell
npm run dist
```

Salida principal:

- `dist/Convertidor PDF a Excel-Setup-1.0.0.exe`

Atajo disponible:

- `CREAR_INSTALADOR.bat`

### 3) Portable (single exe)

```powershell
npm run dist:portable
```

## Flujo funcional

1. El usuario abre un PDF.
2. El sistema detecta si hay texto seleccionable.
3. Si no hay texto, aplica OCR por pagina.
4. Normaliza lineas y detecta filas estructuradas.
5. Exporta resultado a TXT/CSV/XLSX.

## OCR y modo offline

- Se usa `tesseract.js` en proceso principal (Node) para mayor estabilidad en Electron.
- Si existe `spa.traineddata`, se usa localmente.
- `spa.traineddata` se incluye en el instalador via `extraResources`.

## Estructura relevante

- `src/main.js`: proceso principal, dialogos, guardado y OCR.
- `src/preload.js`: puente seguro IPC.
- `src/renderer.js`: UI, lectura PDF, parseo y exportacion.
- `src/index.html`: estructura de interfaz.
- `src/styles.css`: estilos.
- `tools/generate-icon.mjs`: genera `build/icon.ico` desde `logo.png`.

## Scripts de NPM

- `npm start`: inicia app.
- `npm run build:icon`: genera icono `.ico`.
- `npm run pack`: crea carpeta `win-unpacked`.
- `npm run dist`: crea instalador NSIS.
- `npm run dist:portable`: crea ejecutable portable.

## Troubleshooting rapido

- "No abre selector de archivo": verificar que ejecutas el build actualizado.
- "Error OCR": comprobar que `spa.traineddata` este en la raiz del proyecto o en recursos del build.
- Build bloqueado por antivirus: usar `npm run pack` o agregar exclusion temporal de `dist` en Defender.

## Licencia

Uso interno / privado (ajustar segun tu distribucion).