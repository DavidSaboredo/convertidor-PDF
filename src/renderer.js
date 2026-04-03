// pdfjs-dist v3.11 cargado via <script> en index.html → window.pdfjsLib
// OCR se ejecuta en el proceso main (Node) via IPC

const pdfjsLib = window.pdfjsLib;
const XLSX = window.XLSX;

if (!XLSX) {
  throw new Error('XLSX no disponible. Verifica que xlsx.full.min.js este cargado.');
}

if (!window.desktopAPI) {
  throw new Error('desktopAPI no disponible. Usa index.html en Electron o web.html en navegador.');
}

// En la app empaquetada el worker está en extraResources (fuera del asar) para
// que new Worker() pueda abrirlo con acceso normal al sistema de archivos.
// En modo dev no existe ese archivo y se usa la ruta relativa a node_modules.
const workerSrc = typeof window.desktopAPI.pdfWorkerSrc === 'function'
  ? window.desktopAPI.pdfWorkerSrc()
  : null;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc || new URL(
  '../node_modules/pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

const openFileButton = document.getElementById('openFileButton');
const exportTxtButton = document.getElementById('exportTxtButton');
const exportCsvButton = document.getElementById('exportCsvButton');
const exportXlsxButton = document.getElementById('exportXlsxButton');
const exportWordButton = document.getElementById('exportWordButton');
const fileName = document.getElementById('fileName');
const statusText = document.getElementById('statusText');
const pagesCount = document.getElementById('pagesCount');
const linesCount = document.getElementById('linesCount');
const rowsCount = document.getElementById('rowsCount');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const cleanTextOutput = document.getElementById('cleanTextOutput');
const tableBody = document.getElementById('tableBody');

let appState = {
  pdfName: '',
  pages: 0,
  cleanLines: [],
  rows: []
};

// Worker de OCR reutilizable — ya no se necesita, OCR corre en main process

openFileButton.addEventListener('click', loadPdfFile);
exportTxtButton.addEventListener('click', exportTxt);
exportCsvButton.addEventListener('click', exportCsv);
exportXlsxButton.addEventListener('click', exportXlsx);
if (exportWordButton) {
  exportWordButton.addEventListener('click', exportWord);
}

async function loadPdfFile() {
  resetViewForProcessing();
  statusText.textContent = 'Abriendo selector de archivo';

  const selected = await window.desktopAPI.pickPdfFile();
  if (!selected) {
    statusText.textContent = 'Carga cancelada';
    progressLabel.textContent = 'No se selecciono ningun archivo';
    return;
  }

  fileName.textContent = selected.fileName;
  appState.pdfName = selected.fileName.replace(/\.pdf$/i, '');

  try {
    const pdfBytes = decodeBase64ToUint8(selected.bytes);
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;
    appState.pages = pdf.numPages;
    pagesCount.textContent = String(pdf.numPages);

    const cleanLines = [];
    const structuredRows = [];
    let useOCR = false;

    // Primera pasada: detectar si necesita OCR
    for (let pageNumber = 1; pageNumber <= Math.min(2, pdf.numPages); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const textLength = textContent.items.reduce((sum, item) => sum + (item.str || '').length, 0);
      
      if (textLength < 50) {
        useOCR = true;
        break;
      }
    }

    // Procesar todas las páginas
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      
      let pageLines = [];
      
      if (useOCR) {
        statusText.textContent = `Escaneando pagina ${pageNumber} de ${pdf.numPages} (OCR)`;
        progressLabel.textContent = `Renderizando pagina ${pageNumber} para OCR...`;
        pageLines = await processPageWithOCR(page, pageNumber, pdf.numPages);

        cleanLines.push(...pageLines);
        structuredRows.push(...extractRowsFromLines(pageLines));
      } else {
        statusText.textContent = `Procesando pagina ${pageNumber} de ${pdf.numPages}`;
        progressLabel.textContent = `Reconstruyendo bloques de texto pagina ${pageNumber}`;
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        const lines = groupItemsIntoLines(textContent.items, viewport.width);

        cleanLines.push(...lines.map((line) => line.text));
        structuredRows.push(...extractRowsFromLines(lines));
      }

      progressBar.style.width = `${Math.round((pageNumber / pdf.numPages) * 100)}%`;
    }

    appState.cleanLines = normalizeCleanLines(cleanLines);
    appState.rows = deduplicateRows(structuredRows);

    renderOutput();
    statusText.textContent = `Procesamiento completado${useOCR ? ' (OCR)' : ''}`;
    progressLabel.textContent = `Listo. ${appState.rows.length} filas detectadas.`;
  } catch (error) {
    console.error('Error al procesar PDF:', error);
    statusText.textContent = 'Error al leer el PDF';
    progressLabel.textContent = String(error);
    cleanTextOutput.value = `Error: ${error.message || error}\n\nRevisa la consola para mas detalles.`;
  }
}

async function processPageWithOCR(page, pageNum, totalPages) {
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;

  // Convertir canvas a base64 JPEG (mas compacto que PNG para OCR)
  const imageBase64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];

  // Liberar memoria del canvas antes del OCR
  canvas.width = 1;
  canvas.height = 1;

  const result = await window.desktopAPI.ocrImage({ imageBase64, pageNum, totalPages });

  if (!result.ok) {
    throw new Error(`OCR fallo en pagina ${pageNum}: ${result.error}`);
  }

  return result.text
    .split('\n')
    .map((line) => sanitizeText(line))
    .filter((line) => line.length >= 2);
}

function resetViewForProcessing() {
  appState = {
    pdfName: '',
    pages: 0,
    cleanLines: [],
    rows: []
  };

  pagesCount.textContent = '0';
  linesCount.textContent = '0';
  rowsCount.textContent = '0';
  progressBar.style.width = '0%';
  progressLabel.textContent = 'Preparando lectura';
  cleanTextOutput.value = '';
  renderTable([]);
  disableExportButtons(true);
}

function renderOutput() {
  const cleanText = appState.cleanLines.join('\n');

  cleanTextOutput.value = cleanText;
  linesCount.textContent = String(appState.cleanLines.length);
  rowsCount.textContent = String(appState.rows.length);
  renderTable(appState.rows.slice(0, 250));
  disableExportButtons(appState.cleanLines.length === 0 && appState.rows.length === 0);
}

function disableExportButtons(disabled) {
  exportTxtButton.disabled = disabled;
  exportCsvButton.disabled = disabled;
  exportXlsxButton.disabled = disabled;
  if (exportWordButton) {
    exportWordButton.disabled = disabled;
  }
}

function groupItemsIntoLines(items, pageWidth) {
  const glyphs = items
    .map((item) => {
      const text = sanitizeText(item.str || '');
      if (!text) {
        return null;
      }

      return {
        text,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 0,
        pageWidth
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const verticalDelta = Math.abs(right.y - left.y);
      if (verticalDelta > 3) {
        return right.y - left.y;
      }

      return left.x - right.x;
    });

  const lines = [];

  for (const glyph of glyphs) {
    let targetLine = lines.find((line) => Math.abs(line.y - glyph.y) <= 3);

    if (!targetLine) {
      targetLine = { y: glyph.y, items: [] };
      lines.push(targetLine);
    }

    targetLine.items.push(glyph);
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => buildLineRecord(line.items, pageWidth))
    .filter((line) => shouldKeepLine(line.text));
}

function buildLineRecord(items, pageWidth) {
  const sortedItems = [...items].sort((left, right) => left.x - right.x);
  let text = '';
  let previousItem = null;

  for (const item of sortedItems) {
    if (previousItem) {
      const gap = item.x - (previousItem.x + previousItem.width);
      if (gap > 10) {
        text += ' ';
      }
    }

    text += item.text;
    previousItem = item;
  }

  return {
    text: sanitizeText(text),
    items: sortedItems,
    pageWidth
  };
}

function extractRowsFromLines(lines) {
  const rows = [];
  let pendingRow = null;

  for (const line of lines) {
    const text = typeof line === 'string' ? line : line.text;
    if (!text || shouldKeepLine(text) === false) {
      continue;
    }

    // Si la línea no tiene coordenadas (viene de OCR), usar parser por regex
    const hasCoords = line.items && line.items.length > 0;
    const parsed = hasCoords
      ? parseStructuredLine({ items: line.items, pageWidth: line.pageWidth || 612, text })
      : parseLineByRegex(text);

    if (!parsed) {
      if (pendingRow && looksLikeContinuation(text)) {
        pendingRow.descripcion = sanitizeText(`${pendingRow.descripcion} ${text}`);
      }
      continue;
    }

    if (pendingRow && pendingRow.codigo !== parsed.codigo) {
      rows.push(finalizeRow(pendingRow));
      pendingRow = null;
    }

    if (parsed.stock) {
      const completed = pendingRow && pendingRow.codigo === parsed.codigo
        ? {
            ...pendingRow,
            descripcion: sanitizeText(`${pendingRow.descripcion} ${parsed.descripcion}`),
            stock: parsed.stock
          }
        : parsed;

      rows.push(finalizeRow(completed));
      pendingRow = null;
      continue;
    }

    pendingRow = pendingRow && pendingRow.codigo === parsed.codigo
      ? {
          ...pendingRow,
          descripcion: sanitizeText(`${pendingRow.descripcion} ${parsed.descripcion}`)
        }
      : parsed;
  }

  if (pendingRow) {
    rows.push(finalizeRow(pendingRow));
  }

  return rows.filter(Boolean);
}

// Parser por regex para líneas de OCR (sin información de coordenadas X/Y)
// Espera formato: CODIGO DESCRIPCION [STOCK]
// Ej: "1234567 TORNILLO 1/4 PULGADA 50.00"
function parseLineByRegex(text) {
  const trimmed = text.trim();

  // El código empieza con 4-14 dígitos al inicio de la línea
  const codeMatch = trimmed.match(/^(\d{4,14})\b/);
  if (!codeMatch) return null;

  const code = codeMatch[1];
  const rest = trimmed.slice(code.length).trim();
  if (!rest) return null;

  // El stock es un número decimal al final (puede ser negativo)
  const stockMatch = rest.match(/\s+(-?\d{1,8}[.,]\d{1,3})$/);

  const description = sanitizeText(
    stockMatch ? rest.slice(0, rest.length - stockMatch[0].length) : rest
  );

  if (!description || description.length < 2) return null;

  return {
    codigo: code,
    descripcion: description,
    stock: stockMatch ? normalizeStock(stockMatch[1]) : null
  };
}

function parseStructuredLine(line) {
  const columns = {
    codeLimit: Math.max(100, line.pageWidth * 0.16),
    stockLimit: line.pageWidth * 0.73
  };

  const codeParts = [];
  const descriptionParts = [];
  const stockParts = [];

  for (const item of line.items) {
    const value = sanitizeText(item.text);
    if (!value) {
      continue;
    }

    if (item.x <= columns.codeLimit && /^\d{4,14}$/.test(value)) {
      codeParts.push(value);
      continue;
    }

    if (item.x >= columns.stockLimit && /-?\d+(?:[.,]\d{1,3})?$/.test(value)) {
      stockParts.push(normalizeStock(value));
      continue;
    }

    descriptionParts.push(value);
  }

  const code = codeParts[0] || extractCodeFromText(line.text);
  const stock = stockParts.at(-1) || extractStockFromText(line.text);
  const description = sanitizeText(descriptionParts.join(' '))
    .replace(code || '', '')
    .replace(stock || '', '')
    .trim();

  if (!code || !description) {
    return null;
  }

  return {
    codigo: code,
    descripcion: description,
    stock
  };
}

function finalizeRow(row) {
  if (!row.codigo || !row.descripcion) {
    return null;
  }

  return {
    codigo: row.codigo,
    descripcion: sanitizeText(row.descripcion),
    stock: row.stock || '0.00'
  };
}

function deduplicateRows(rows) {
  const seen = new Set();
  const uniqueRows = [];

  for (const row of rows) {
    const key = `${row.codigo}|${row.descripcion}|${row.stock}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

function normalizeCleanLines(lines) {
  return lines
    .map((line) => sanitizeText(line))
    .filter((line) => line.length > 0);
}

function shouldKeepLine(text) {
  if (!text) {
    return false;
  }

  const noisePatterns = [
    /pagina\s+\d+/i,
    /impresion/i,
    /existencia/i,
    /codigo\s+descripcion/i,
    /listado/i,
    /papetti/i
  ];

  return !noisePatterns.some((pattern) => pattern.test(text));
}

function looksLikeContinuation(text) {
  return /[a-zA-Z]{3,}/.test(text) && !/^\d{4,14}/.test(text);
}

function extractCodeFromText(text) {
  return text.match(/\b\d{4,14}\b/)?.[0] || '';
}

function extractStockFromText(text) {
  const match = text.match(/-?\d+(?:[.,]\d{1,3})?(?!.*-?\d+(?:[.,]\d{1,3})?)/);
  return match ? normalizeStock(match[0]) : '';
}

function normalizeStock(value) {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return parsed.toFixed(2);
}

function sanitizeText(value) {
  return String(value)
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderTable(rows) {
  if (rows.length === 0) {
    tableBody.innerHTML = '<tr class="empty-row"><td colspan="3">Todavia no hay datos procesados.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td class="mono">${escapeHtml(row.codigo)}</td>
        <td>${escapeHtml(row.descripcion)}</td>
        <td class="mono stock ${Number.parseFloat(row.stock) < 0 ? 'negative' : 'positive'}">${escapeHtml(row.stock)}</td>
      </tr>
    `)
    .join('');
}

async function exportTxt() {
  const content = appState.cleanLines.join('\n');
  await window.desktopAPI.saveFile({
    defaultName: `${appState.pdfName || 'salida'}_limpio.txt`,
    filters: [{ name: 'Texto', extensions: ['txt'] }],
    content,
    encoding: 'utf8'
  });
}

async function exportCsv() {
  const header = 'CODIGO;DESCRIPCION;STOCK';
  const body = appState.rows.map((row) => {
    const descripcion = row.descripcion.replace(/;/g, ' ');
    return `${row.codigo};${descripcion};${row.stock.replace('.', ',')}`;
  });

  await window.desktopAPI.saveFile({
    defaultName: `${appState.pdfName || 'salida'}_tabla.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    content: `\uFEFF${[header, ...body].join('\n')}`,
    encoding: 'utf8'
  });
}

async function exportXlsx() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(appState.rows.map((row) => ({
    CODIGO: row.codigo,
    DESCRIPCION: row.descripcion,
    STOCK: Number.parseFloat(row.stock)
  })));

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

  await window.desktopAPI.saveFile({
    defaultName: `${appState.pdfName || 'salida'}_tabla.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    content: Array.from(new Uint8Array(data)),
    encoding: 'binary'
  });
}

async function exportWord() {
  const rowsHtml = appState.rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.codigo)}</td>
        <td>${escapeHtml(row.descripcion)}</td>
        <td>${escapeHtml(row.stock)}</td>
      </tr>
    `)
    .join('');

  const bodyTable = appState.rows.length > 0
    ? rowsHtml
    : '<tr><td colspan="3">Sin filas detectadas</td></tr>';

  const htmlDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Exportacion Word</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    h1 { font-size: 14pt; margin-bottom: 6px; }
    p.meta { color: #444; margin-top: 0; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #999; padding: 6px; text-align: left; }
    th { background: #f1f1f1; }
  </style>
</head>
<body>
  <h1>Convertidor PDF - Exportacion</h1>
  <p class="meta">Archivo: ${escapeHtml(appState.pdfName || 'salida')} | Filas: ${appState.rows.length}</p>
  <table>
    <thead>
      <tr>
        <th>CODIGO</th>
        <th>DESCRIPCION</th>
        <th>STOCK</th>
      </tr>
    </thead>
    <tbody>
      ${bodyTable}
    </tbody>
  </table>
</body>
</html>`;

  await window.desktopAPI.saveFile({
    defaultName: `${appState.pdfName || 'salida'}_tabla.doc`,
    filters: [{ name: 'Word', extensions: ['doc'] }],
    content: `\uFEFF${htmlDoc}`,
    encoding: 'utf8',
    mimeType: 'application/msword'
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function decodeBase64ToUint8(base64Data) {
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);

  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return bytes;
}