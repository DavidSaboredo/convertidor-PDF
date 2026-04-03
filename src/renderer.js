// Inicializar app cuando todos los módulos estén listos
(async function initializeApp() {
  try {
    // Esperar a que módulos globales estén disponibles
    let attempts = 0;
    while ((!window.pdfjsLib || !window.XLSX || !window.desktopAPI) && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts += 1;
    }

    if (!window.pdfjsLib) throw new Error('PDF.js no disponible');
    if (!window.XLSX) throw new Error('XLSX no disponible');
    if (!window.desktopAPI) throw new Error('desktopAPI no disponible');

    console.log('✓ Módulos globales listos');

    const pdfjsLib = window.pdfjsLib;
    const XLSX = window.XLSX;

    // Configurar PDF worker
    const wokerSrc = typeof window.desktopAPI.pdfWorkerSrc === 'function'
      ? window.desktopAPI.pdfWorkerSrc()
      : 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    pdfjsLib.GlobalWorkerOptions.workerSrc = wokerSrc;

    // Referencias DOM
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

    if (!openFileButton) throw new Error('openFileButton no existe');

    let appState = {
      pdfName: '',
      pages: 0,
      cleanLines: [],
      rows: []
    };

    // Funciones helper
    function resetViewForProcessing() {
      appState = { pdfName: '', pages: 0, cleanLines: [], rows: [] };
      pagesCount.textContent = '0';
      linesCount.textContent = '0';
      rowsCount.textContent = '0';
      progressBar.style.width = '0%';
      progressLabel.textContent = 'Preparando lectura';
      cleanTextOutput.value = '';
      renderTable([]);
      disableExportButtons(true);
    }

    function disableExportButtons(disabled) {
      exportTxtButton.disabled = disabled;
      exportCsvButton.disabled = disabled;
      exportXlsxButton.disabled = disabled;
      if (exportWordButton) exportWordButton.disabled = disabled;
    }

    function renderOutput() {
      const cleanText = appState.cleanLines.join('\n');
      cleanTextOutput.value = cleanText;
      linesCount.textContent = String(appState.cleanLines.length);
      rowsCount.textContent = String(appState.rows.length);
      renderTable(appState.rows.slice(0, 250));
      disableExportButtons(appState.cleanLines.length === 0 && appState.rows.length === 0);
    }

    function renderTable(rows) {
      if (rows.length === 0) {
        tableBody.innerHTML = '<tr class="empty-row"><td colspan="3">Sin datos procesados.</td></tr>';
        return;
      }
      tableBody.innerHTML = rows
        .map((row) => `
          <tr>
            <td class="mono">${escapeHtml(row.codigo)}</td>
            <td>${escapeHtml(row.descripcion)}</td>
            <td class="mono">${escapeHtml(row.stock)}</td>
          </tr>
        `)
        .join('');
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Exportadores
    async function exportTxt() {
      const content = appState.cleanLines.join('\n');
      await window.desktopAPI.saveFile({
        defaultName: `${appState.pdfName || 'salida'}_limpio.txt`,
        content,
        encoding: 'utf8'
      });
    }

    async function exportCsv() {
      const header = 'CODIGO;DESCRIPCION;STOCK';
      const body = appState.rows.map((row) => {
        const desc = row.descripcion.replace(/;/g, ' ');
        return `${row.codigo};${desc};${row.stock.replace('.', ',')}`;
      });
      await window.desktopAPI.saveFile({
        defaultName: `${appState.pdfName || 'salida'}_tabla.csv`,
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
        content: Array.from(new Uint8Array(data)),
        encoding: 'binary'
      });
    }

    async function exportWord() {
      const rows = appState.rows.length > 0
        ? appState.rows.map((row) => `<tr><td>${escapeHtml(row.codigo)}</td><td>${escapeHtml(row.descripcion)}</td><td>${escapeHtml(row.stock)}</td></tr>`).join('')
        : '<tr><td colspan="3">Sin filas</td></tr>';

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><style>
body{font-family:Calibri,Arial;font-size:11pt}table{border-collapse:collapse;width:100%;margin-top:12px}
th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#f1f1f1}
</style></head><body><h1>Convertidor PDF</h1><table><thead><tr><th>CODIGO</th><th>DESCRIPCION</th><th>STOCK</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;

      await window.desktopAPI.saveFile({
        defaultName: `${appState.pdfName || 'salida'}_tabla.doc`,
        content: `\uFEFF${html}`,
        encoding: 'utf8',
        mimeType: 'application/msword'
      });
    }

    // Procesador PDF simple
    async function loadPdfFile() {
      resetViewForProcessing();
      statusText.textContent = 'Abriendo selector de archivo';

      const selected = await window.desktopAPI.pickPdfFile();
      if (!selected) {
        statusText.textContent = 'Cancelado';
        return;
      }

      fileName.textContent = selected.fileName;
      appState.pdfName = selected.fileName.replace(/\.pdf$/i, '');

      try {
        // Decodificar PDF
        const binaryStr = atob(selected.bytes);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        appState.pages = pdf.numPages;
        pagesCount.textContent = String(pdf.numPages);

        const cleanLines = [];
        const rows = [];

        // Procesar páginas
        for (let i = 1; i <= pdf.numPages; i++) {
          statusText.textContent = `Procesando página ${i} de ${pdf.numPages}`;
          progressBar.style.width = `${Math.round((i / pdf.numPages) * 100)}%`;

          const page = await pdf.getPage(i);
          const text = await page.getTextContent();

          text.items.forEach((item) => {
            const line = (item.str || '').trim();
            if (line.length > 0) cleanLines.push(line);
          });
        }

        appState.cleanLines = cleanLines;
        appState.rows = cleanLines
          .filter((line) => /^\d{4,14}/.test(line))
          .map((line) => {
            const match = line.match(/^(\d{4,14})\s+(.+)\s+(\d+[.,]\d{1,3})$/);
            if (match) {
              return {
                codigo: match[1],
                descripcion: match[2],
                stock: match[3].replace(',', '.')
              };
            }
            return null;
          })
          .filter(Boolean);

        renderOutput();
        statusText.textContent = 'Completado';
        progressLabel.textContent = `${appState.rows.length} filas detectadas`;
      } catch (error) {
        console.error('Error:', error);
        statusText.textContent = 'Error';
        progressLabel.textContent = String(error);
      }
    }

    // Asignar listeners
    console.log('Asignando event listeners...');
    openFileButton.addEventListener('click', loadPdfFile);
    exportTxtButton.addEventListener('click', exportTxt);
    exportCsvButton.addEventListener('click', exportCsv);
    exportXlsxButton.addEventListener('click', exportXlsx);
    if (exportWordButton) {
      exportWordButton.addEventListener('click', exportWord);
    }

    console.log('✓ App inicializada correctamente');
    statusText.textContent = 'Listo';

  } catch (error) {
    console.error('ERROR en initializeApp:', error);
    alert('Error: ' + error.message);
  }
})();
