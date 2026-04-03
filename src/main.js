const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const Tesseract = require('tesseract.js');

function resolveLangPath() {
  const candidates = [
    path.join(process.resourcesPath, 'spa.traineddata'),
    path.join(app.getAppPath(), 'spa.traineddata'),
    path.join(process.cwd(), 'spa.traineddata')
  ];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return path.dirname(candidate);
    }
  }

  return undefined;
}

// En la app empaquetada los archivos de tesseract.js están en app.asar.unpacked
// para que worker_threads.Worker() pueda abrirlos con acceso normal al FS.
// En modo dev (no packaged) se retorna undefined y tesseract usa su ruta default.
function resolveTesseractWorkerPath() {
  const unpackedPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'tesseract.js',
    'src',
    'worker-script',
    'node',
    'index.js'
  );

  if (fsSync.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return undefined;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#101418',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('pick-pdf-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const bytes = await fs.readFile(filePath);

  return {
    filePath,
    fileName: path.basename(filePath),
    bytes: bytes.toString('base64')
  };
});

ipcMain.handle('save-text-file', async (_event, payload) => {
  const result = await dialog.showSaveDialog({
    title: 'Guardar archivo',
    defaultPath: payload.defaultName,
    filters: payload.filters
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  const data = payload.encoding === 'binary'
    ? Buffer.from(payload.content)
    : payload.content;

  await fs.writeFile(result.filePath, data);

  return {
    saved: true,
    filePath: result.filePath
  };
});

// Worker OCR reutilizable — se crea una vez por sesión
let ocrWorker = null;

ipcMain.handle('ocr-image', async (_event, { imageBase64, pageNum, totalPages }) => {
  try {
    if (!ocrWorker) {
      const langPath = resolveLangPath();
      const tesseractWorkerPath = resolveTesseractWorkerPath();
      ocrWorker = await Tesseract.createWorker('spa', 1, {
        ...(langPath ? { langPath } : {}),
        ...(tesseractWorkerPath ? { workerPath: tesseractWorkerPath } : {}),
        logger: () => {}
      });
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const { data } = await ocrWorker.recognize(imageBuffer);

    return {
      ok: true,
      text: data.text,
      pageNum,
      totalPages
    };
  } catch (err) {
    console.error('OCR error pagina', pageNum, err);
    return { ok: false, error: String(err), pageNum, totalPages };
  }
});

app.on('before-quit', async () => {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
});