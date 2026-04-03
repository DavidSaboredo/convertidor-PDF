const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Returns a file:// URL to the pdf.worker placed in extraResources when packaged,
// or null in dev mode (renderer falls back to the relative node_modules path).
function getPdfWorkerSrc() {
  const workerPath = path.join(process.resourcesPath, 'pdf.worker.min.js');
  if (fs.existsSync(workerPath)) {
    return pathToFileURL(workerPath).href;
  }
  return null;
}

contextBridge.exposeInMainWorld('desktopAPI', {
  pickPdfFile: () => ipcRenderer.invoke('pick-pdf-file'),
  saveFile: (payload) => ipcRenderer.invoke('save-text-file', payload),
  ocrImage: (payload) => ipcRenderer.invoke('ocr-image', payload),
  pdfWorkerSrc: () => getPdfWorkerSrc()
});