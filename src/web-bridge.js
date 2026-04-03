let ocrWorker = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

async function getOcrWorker() {
  if (ocrWorker) {
    return ocrWorker;
  }

  // Esperar a que window.Tesseract esté disponible (cargado por <script>)
  let attempts = 0;
  while (!window.Tesseract && attempts < 30) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts += 1;
  }

  if (!window.Tesseract) {
    throw new Error('Tesseract.js no se cargó desde CDN. Verifica tu conexión de internet.');
  }

  ocrWorker = await window.Tesseract.createWorker('spa', 1, {
    logger: () => {}
  });
  return ocrWorker;
}

async function pickPdfFromBrowser() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';

    input.addEventListener('change', async () => {
      const [file] = input.files || [];
      if (!file) {
        resolve(null);
        return;
      }

      const bytes = await file.arrayBuffer();
      resolve({
        filePath: file.name,
        fileName: file.name,
        bytes: arrayBufferToBase64(bytes)
      });
    }, { once: true });

    input.click();
  });
}

async function saveFileFromBrowser(payload) {
  const fileName = payload.defaultName || 'salida.txt';
  const mimeType = payload.mimeType || (payload.encoding === 'binary'
    ? 'application/octet-stream'
    : 'text/plain;charset=utf-8');

  const data = payload.encoding === 'binary'
    ? new Uint8Array(payload.content)
    : payload.content;

  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return { saved: true, filePath: fileName };
}

async function ocrImageInBrowser({ imageBase64, pageNum, totalPages }) {
  try {
    const worker = await getOcrWorker();
    const imageBlob = base64ToBlob(imageBase64, 'image/jpeg');
    const { data } = await worker.recognize(imageBlob);

    return {
      ok: true,
      text: data.text,
      pageNum,
      totalPages
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err),
      pageNum,
      totalPages
    };
  }
}

window.desktopAPI = {
  pickPdfFile: () => pickPdfFromBrowser(),
  saveFile: (payload) => saveFileFromBrowser(payload),
  ocrImage: (payload) => ocrImageInBrowser(payload),
  pdfWorkerSrc: () => 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
};

window.addEventListener('beforeunload', async () => {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
});
