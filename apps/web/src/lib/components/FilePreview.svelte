<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { getOfficeConfig, getPdfInfo, isNativeMobileApp, pdfPageUrl, saveBinaryFile, saveTextFile } from '$lib/api';
  import FileIcon from '$lib/components/FileIcon.svelte';
  import { fileExtension, imageMimeType, isImageFile } from '$lib/file-kind';
  import {
    isOfficeFile,
    officeKindForExtension,
    officePreviewFromBuffer,
    normalizeSheetRows,
    type OfficeKind,
    type SheetModel
  } from '$lib/office';
  import { buildOnlyOfficeStandaloneUrl, normalizeOnlyOfficeDocumentServerUrl } from '$lib/office-host';
  import type { DriveItem, OfficeEditorConfigResponse } from '$lib/types';

  export let item: DriveItem;
  export let files: DriveItem[] = [];
  export let url = '';
  export let canEditText = true;
  export let canShare = true;
  export let showClose = true;
  export let rawPdfUrl = '';
  export let offlinePdfPageUrls: string[] = [];
  export let offlinePdfWidth: number | null = null;
  export let offlinePdfHeight: number | null = null;
  export let loadPdfInfo: (itemId: string) => Promise<{ pages: number; width: number | null; height: number | null }> =
    getPdfInfo;
  export let renderPdfPageUrl: (itemId: string, page: number) => Promise<string> = pdfPageUrl;
  export let saveTextContent: (itemId: string, content: string) => Promise<DriveItem> = saveTextFile;
  export let saveBinaryContent: (itemId: string, contentBase64: string, mimeType?: string) => Promise<DriveItem> =
    saveBinaryFile;
  export let loadOfficeConfig: (itemId: string, mode?: 'view' | 'edit') => Promise<OfficeEditorConfigResponse> =
    getOfficeConfig;
  export let autoOpenOfficeEditor = false;

  const dispatch = createEventDispatcher<{
    close: void;
    download: DriveItem;
    share: DriveItem;
    more: DriveItem;
    navigate: DriveItem;
    updated: DriveItem;
    refresh: void;
  }>();

  let zoom = 100;
  let page = 1;
  let pageCount: number | null = null;
  let textContent = '';
  let savedTextContent = '';
  let textEditing = false;
  let textLoading = false;
  let textSaving = false;
  let textError = '';
  let textStatus = '';
  let pdfLoading = false;
  let pdfError = '';
  let pdfPageWidth = 344;
  let pdfPageHeight = 494;
  let pdfPageUrls: string[] = [];
  let pdfObjectUrls: string[] = [];
  let lastLoadedId = '';
  let objectUrl = '';
  let imageLoading = false;
  let imageError = '';
  let pdfHost: HTMLDivElement;
  let pdfScroll: HTMLDivElement;
  let imageScroll: HTMLDivElement;
  let imageStage: HTMLDivElement;
  let previewImageEl: HTMLImageElement;
  let imageNaturalWidth = 0;
  let imageNaturalHeight = 0;
  let imageFitWidth = 0;
  let imageResizeObserver: ResizeObserver | null = null;
  let observedImageScroll: HTMLDivElement | null = null;
  let imagePointers = new Map<number, { x: number; y: number }>();
  let imagePinchStartDistance = 0;
  let imagePinchStartZoom = 100;
  let imagePinchAnchor: ImageZoomAnchor = null;
  let pdfLoadRun = 0;
  let imageLoadRun = 0;
  let officeLoadRun = 0;
  let officeLoading = false;
  let officeReady = false;
  let officeError = '';
  let officeSaving = false;
  let officeStatus = '';
  let officeEditVersion = 0;
  let officeSavedEditVersion = 0;
  let officeDocumentHtml = '';
  let savedOfficeDocumentText = '';
  let officeDocumentHost: HTMLDivElement;
  let officePptHost: HTMLDivElement;
  let officeSheets: SheetModel[] = [];
  let savedOfficeSheetsJson = '';
  let officeActiveSheet = 0;
  let sheetRowOffset = 0;
  let sheetColumnOffset = 0;
  let sheetActiveRow = 0;
  let sheetActiveColumn = 0;
  let sheetAnchorRow = 0;
  let sheetAnchorColumn = 0;
  let sheetColumnWidths: number[][] = [];
  let sheetRowHeights: number[][] = [];
  let sheetUndoStack: SheetHistoryEntry[] = [];
  let sheetRedoStack: SheetHistoryEntry[] = [];
  let sheetResizeState:
    | { type: 'column' | 'row'; index: number; start: number; size: number; sheetIndex: number }
    | null = null;
  let documentFontFamily = 'Arial';
  let documentFontSize = '14px';
  let officePresentationMode: 'rendered' | 'outline' = 'rendered';
  let officePresentationTitle = '';
  let officePresentationLines: string[] = [];
  let officeWorkbookModule: typeof import('xlsx') | null = null;
  let officePptPreviewer: { preview: (buffer: ArrayBuffer) => Promise<unknown> | unknown; destroy?: () => void } | null =
    null;
  let fullOfficeOpen = false;
  let fullOfficeMode: 'onlyoffice' | 'local' = 'local';
  let fullOfficeLoading = false;
  let fullOfficeError = '';
  let fullOfficeStatus = '';
  let fullOfficeHostKey = '';
  let fullOfficeFrameUrl = '';
  let fullOfficeFrameOrigin = '';
  let fullOfficeFrame: HTMLIFrameElement | null = null;
  let fullOfficeRun = 0;
  let fullOfficeReadyTimer: ReturnType<typeof setTimeout> | null = null;
  let autoOpenedOfficeItemId = '';
  let firstPdfPageReady = false;
  let pointerStartedOnBackdrop = false;
  let abortController: AbortController | null = null;

  const SHEET_VISIBLE_ROWS = 80;
  const SHEET_VISIBLE_COLUMNS = 26;
  const DEFAULT_SHEET_COLUMN_WIDTH = 128;
  const DEFAULT_SHEET_ROW_HEIGHT = 32;
  const MAX_SHEET_HISTORY = 80;
  const DOCUMENT_FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'];
  const DOCUMENT_FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px'];
  const PDF_MIN_ZOOM = 25;
  const PDF_MAX_ZOOM = 800;
  const PDF_ZOOM_STEP = 25;
  const PREVIEW_MIN_ZOOM = 50;
  const PREVIEW_MAX_ZOOM = 600;
  const PREVIEW_ZOOM_STEP = 25;

  type SheetCellSnapshot = { row: number; column: number; value: string };
  type PdfZoomAnchor = { pageNumber: number; xRatio: number; yRatio: number } | null;
  type ImageZoomAnchor = { xRatio: number; yRatio: number; viewportX: number; viewportY: number } | null;
  type SheetHistoryEntry = {
    before: SheetCellSnapshot[];
    after: SheetCellSnapshot[];
    activeRow: number;
    activeColumn: number;
    anchorRow: number;
    anchorColumn: number;
  };

  $: extension = fileExtension(item);
  $: mimeType = item.mimeType || '';
  $: kind = fileKind(item);
  $: currentIndex = files.findIndex((entry) => entry.id === item.id);
  $: previousItem = currentIndex > 0 ? files[currentIndex - 1] : null;
  $: nextItem = currentIndex >= 0 && currentIndex < files.length - 1 ? files[currentIndex + 1] : null;
  $: hasOfflinePdfPages = offlinePdfPageUrls.length > 0;
  $: pdfRawPreviewUrl = rawPdfUrl && !hasOfflinePdfPages ? rawPdfUrl : '';
  $: canZoom = (kind === 'pdf' && !pdfRawPreviewUrl) || kind === 'text' || kind === 'image';
  $: textDirty = kind === 'text' && textContent !== savedTextContent;
  $: officeKind = kind === 'office' ? officeFileKind(extension, mimeType) : 'unsupported';
  $: officeCanSave = canEditText && ((officeKind === 'document' && extension === 'docx') || officeKind === 'spreadsheet');
  $: officeDirty = officeCanSave && kind === 'office' && officeEditVersion !== officeSavedEditVersion;
  $: activeSheet = officeSheets[officeActiveSheet] ?? null;
  $: visibleSheetRows = activeSheet ? sheetVisibleRows(activeSheet) : [];
  $: visibleSheetColumns = activeSheet ? sheetVisibleColumns(activeSheet) : [];
  $: activeCellAddress = cellAddress(sheetActiveRow, sheetActiveColumn);
  $: activeCellFormula = activeSheet?.rows[sheetActiveRow]?.[sheetActiveColumn] ?? '';
  $: selectedSheetRange = normalizedSheetRange();
  $: selectedSheetAddress = rangeAddress(selectedSheetRange);
  $: if (item.id !== lastLoadedId) loadCurrentFile();
  $: if (kind === 'image' && imageScroll !== observedImageScroll) setupImageResizeObserver();
  $: if (kind === 'image') {
    zoom;
    imageFitWidth;
    objectUrl;
    applyImageElementSize();
  }
  $: if (autoOpenOfficeEditor && kind === 'office' && item.id !== autoOpenedOfficeItemId && !fullOfficeOpen) {
    autoOpenedOfficeItemId = item.id;
    void tick().then(() => openFullOfficeEditor());
  }

  /** Chooses the preview engine from MIME type first, then extension fallbacks. */
  function fileKind(current: DriveItem): 'pdf' | 'text' | 'image' | 'video' | 'office' | 'unsupported' {
    const ext = (current.extension || current.name.split('.').pop() || '').toLowerCase();
    const mime = current.mimeType || '';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (isImageFile(current)) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (isOfficeFile(ext, mime)) return 'office';
    if (
      mime.startsWith('text/') ||
      ['txt', 'md', 'log', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'svelte', 'env'].includes(ext)
    )
      return 'text';
    return 'unsupported';
  }

  function officeFileKind(ext: string, mime: string): OfficeKind {
    return officeKindForExtension(ext, mime);
  }

  function officeAppName() {
    if (officeKind === 'spreadsheet') return 'Excel';
    if (officeKind === 'presentation') return 'PowerPoint';
    return 'Word';
  }

  function officeAppGlyph() {
    if (officeKind === 'spreadsheet') return 'X';
    if (officeKind === 'presentation') return 'P';
    return 'W';
  }

  function officeAppColor() {
    if (officeKind === 'spreadsheet') return '#188038';
    if (officeKind === 'presentation') return '#e8710a';
    return '#4285f4';
  }

  /** Opens a print-only document so preview chrome never appears in browser print output. */
  function printDocument(body: string, extraStyle = '') {
    const target = window.open('', '_blank');
    if (!target) {
      window.print();
      return;
    }
    target.document.open();
    const styleOpen = '<' + 'style>';
    const styleClose = '</' + 'style>';
    target.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(item.name)}</title>
    ${styleOpen}
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #fff; color: #111; font-family: Arial, sans-serif; }
      img { max-width: 100%; }
      .print-page { min-height: 100vh; break-after: page; page-break-after: always; break-inside: avoid; page-break-inside: avoid; display: flex; justify-content: center; align-items: center; overflow: hidden; padding: 0; }
      .print-page:last-child { break-after: auto; page-break-after: auto; }
      .print-page img { width: auto; height: auto; max-width: 100vw; max-height: 100vh; display: block; object-fit: contain; }
      pre { margin: 0; padding: 24px; white-space: pre-wrap; word-break: break-word; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #d0d4da; padding: 5px 7px; vertical-align: top; }
      h1, h2 { break-after: avoid; page-break-after: avoid; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
      ${extraStyle}
    ${styleClose}
  </head>
  <body>${body}</body>
</html>`);
    target.document.close();
  }

  /** Waits for print-window images to load so PDF/image pages are not printed blank. */
  function printWhenReadyScript() {
    return `<script>
      (function () {
        var images = Array.prototype.slice.call(document.images || []);
        var pending = images.filter(function (img) { return !img.complete; }).length;
        var printed = false;
        function done() {
          if (printed) return;
          printed = true;
          setTimeout(function () { window.focus(); window.print(); }, 250);
        }
        if (!pending) { done(); return; }
        images.forEach(function (img) {
          if (img.complete) return;
          var finish = function () { pending -= 1; if (pending <= 0) done(); };
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
        });
        setTimeout(done, 3000);
      })();
    <\/script>`;
  }

  /** Converts the lightweight spreadsheet model into simple printable tables. */
  function printableSpreadsheetHtml() {
    return officeSheets
      .map((sheet) => {
        const columnCount = sheetColumnCount(sheet);
        const rows = sheet.rows.length ? sheet.rows : [[]];
        return `<section class="sheet-print"><h2>${escapeHtml(sheet.name || 'Planilha')}</h2><table><tbody>${rows
          .map(
            (row) =>
              `<tr>${Array.from({ length: columnCount }, (_, index) => `<td>${escapeHtml(row[index] ?? '')}</td>`).join('')}</tr>`
          )
          .join('')}</tbody></table></section>`;
      })
      .join('');
  }

  /** Routes each preview type to the least lossy browser print path. */
  function printCurrentFile() {
    if (kind === 'pdf') {
      if (pdfPageUrls.length) {
        printDocument(
          `${pdfPageUrls
            .map((source) => `<section class="print-page"><img src="${escapeHtml(source)}" alt="" /></section>`)
            .join('')}${printWhenReadyScript()}`,
          '@page { margin: 0; }'
        );
        return;
      }
      const source = pdfRawPreviewUrl || url;
      printDocument(
        `<iframe id="print-frame" src="${escapeHtml(source)}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
        <script>
          var frame = document.getElementById('print-frame');
          frame.addEventListener('load', function () {
            setTimeout(function () {
              try { frame.contentWindow.focus(); frame.contentWindow.print(); }
              catch (error) { window.focus(); window.print(); }
            }, 500);
          });
        <\/script>`,
        '@page { margin: 0; }'
      );
      return;
    }

    if (kind === 'image') {
      printDocument(
        `<main class="image-print"><img src="${escapeHtml(objectUrl || url)}" alt="${escapeHtml(item.name)}" /></main>${printWhenReadyScript()}`,
        '@page { margin: 12mm; } .image-print { min-height: 100vh; display: flex; align-items: center; justify-content: center; } .image-print img { max-height: 96vh; object-fit: contain; }'
      );
      return;
    }

    if (kind === 'text') {
      printDocument(`<pre>${escapeHtml(textContent)}</pre><script>window.focus(); setTimeout(function(){ window.print(); }, 150);<\/script>`);
      return;
    }

    if (kind === 'office') {
      if (officeKind === 'document') {
        printDocument(`<main class="doc-print">${officeDocumentHtml || '<p></p>'}</main><script>window.focus(); setTimeout(function(){ window.print(); }, 250);<\/script>`);
        return;
      }
      if (officeKind === 'spreadsheet') {
        printDocument(`${printableSpreadsheetHtml()}<script>window.focus(); setTimeout(function(){ window.print(); }, 250);<\/script>`);
        return;
      }
      printDocument(
        `<main class="presentation-print"><h1>${escapeHtml(officePresentationTitle || item.name)}</h1>${(officePresentationLines.length
          ? officePresentationLines
          : ['Sem texto extraido desta apresentação.']
        )
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join('')}</main><script>window.focus(); setTimeout(function(){ window.print(); }, 250);<\/script>`
      );
      return;
    }

    printDocument(
      `<iframe id="print-frame" src="${escapeHtml(url)}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
      <script>
        var frame = document.getElementById('print-frame');
        frame.addEventListener('load', function () { setTimeout(function () { window.focus(); window.print(); }, 500); });
      <\/script>`
    );
  }

  /** Resets preview state and dispatches loading to the correct renderer for the active item. */
  async function loadCurrentFile() {
    lastLoadedId = item.id;
    page = 1;
    zoom = kind === 'pdf' ? 200 : 100;
    pageCount = null;
    textContent = '';
    savedTextContent = '';
    textEditing = false;
    textError = '';
    textStatus = '';
    pdfError = '';
    imageLoadRun += 1;
    imageLoading = false;
    imageError = '';
    imageNaturalWidth = 0;
    imageNaturalHeight = 0;
    imageFitWidth = 0;
    resetImageGestureState();
    disconnectImageResizeObserver();
    officeError = '';
    officeReady = false;
    officeStatus = '';
    officeEditVersion = 0;
    officeSavedEditVersion = 0;
    officeDocumentHtml = '';
    savedOfficeDocumentText = '';
    officeSheets = [];
    savedOfficeSheetsJson = '';
    officeActiveSheet = 0;
    sheetRowOffset = 0;
    sheetColumnOffset = 0;
    sheetActiveRow = 0;
    sheetActiveColumn = 0;
    sheetAnchorRow = 0;
    sheetAnchorColumn = 0;
    sheetColumnWidths = [];
    sheetRowHeights = [];
    sheetUndoStack = [];
    sheetRedoStack = [];
    sheetResizeState = null;
    officePresentationMode = 'rendered';
    officePresentationTitle = '';
    officePresentationLines = [];
    closeFullOfficeEditor(false);
    abortController?.abort();
    abortController = new AbortController();
    cleanupPdf();
    cleanupOffice();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }

    if (kind === 'text') {
      textLoading = true;
      try {
        const response = await fetch(url, { cache: 'no-store', signal: abortController.signal });
        if (!response.ok) throw new Error('Falha ao abrir o arquivo.');
        textContent = await response.text();
        savedTextContent = textContent;
      } catch (error) {
        if ((error as Error).name !== 'AbortError') textError = 'Não foi possível carregar o texto.';
      } finally {
        textLoading = false;
      }
      return;
    }

    if (kind === 'pdf') {
      if (hasOfflinePdfPages) {
        pdfPageUrls = offlinePdfPageUrls;
        pageCount = offlinePdfPageUrls.length;
        pdfPageWidth = Math.round((offlinePdfWidth ?? 612) * 1.35);
        pdfPageHeight = Math.round((offlinePdfHeight ?? 792) * 1.35);
        zoom = defaultPdfZoom();
        firstPdfPageReady = true;
        pdfLoading = false;
        return;
      }
      if (pdfRawPreviewUrl) {
        pageCount = 1;
        firstPdfPageReady = true;
        pdfLoading = false;
        return;
      }
      void loadPdfDocument();
      return;
    }

    if (kind === 'image') {
      void loadImagePreview();
      return;
    }

    if (kind === 'office') {
      void loadOfficeEditor();
      return;
    }
  }

  /** Loads images as object URLs so zoom sizing is independent from ticket URL lifetime. */
  async function loadImagePreview() {
    const run = ++imageLoadRun;
    imageLoading = true;
    imageError = '';
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    try {
      const response = await fetch(url, { cache: 'no-store', signal: abortController?.signal });
      if (!response.ok) throw new Error('Falha ao abrir a imagem.');
      let blob = await response.blob();
      if (!blob.type.startsWith('image/') && !isImageFile(item)) throw new Error('Resposta inválida ao abrir a imagem.');
      if (!blob.type.startsWith('image/')) blob = new Blob([blob], { type: imageMimeType(item) });
      if (run !== imageLoadRun) return;
      objectUrl = URL.createObjectURL(blob);
    } catch (error) {
      if (run === imageLoadRun && (error as Error).name !== 'AbortError') {
        imageError = 'Não foi possível carregar a imagem.';
      }
    } finally {
      if (run === imageLoadRun) imageLoading = false;
    }
  }

  /** Revokes generated PDF page URLs and clears page-rendering state. */
  function cleanupPdf() {
    if (pdfHost) pdfHost.innerHTML = '';
    for (const objectUrl of pdfObjectUrls) URL.revokeObjectURL(objectUrl);
    pdfObjectUrls = [];
    pdfLoading = false;
    firstPdfPageReady = false;
    pdfPageUrls = [];
  }

  /** Renders one PDF page through the API and tracks the resulting object URL for cleanup. */
  async function loadPdfPageObjectUrl(itemId: string, pageNumber: number, signal?: AbortSignal) {
    const pageUrl = await renderPdfPageUrl(itemId, pageNumber);
    const response = await fetch(pageUrl, { cache: 'no-store', signal });
    if (!response.ok) throw new Error('Falha ao renderizar página do PDF.');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Resposta inválida ao renderizar PDF.');
    const objectUrl = URL.createObjectURL(blob);
    pdfObjectUrls = [...pdfObjectUrls, objectUrl];
    return objectUrl;
  }

  /** Loads PDF metadata first, then renders pages incrementally for responsive preview startup. */
  async function loadPdfDocument() {
    const run = ++pdfLoadRun;
    pdfLoading = true;
    pdfError = '';
    pageCount = null;
    page = 1;
    try {
      const info = await loadPdfInfo(item.id);
      if (run !== pdfLoadRun) return;
      pdfPageWidth = Math.round((info.width ?? 612) * 1.35);
      pdfPageHeight = Math.round((info.height ?? 792) * 1.35);
      zoom = defaultPdfZoom();
      const urls = await Promise.all(
        Array.from({ length: info.pages }, (_, index) =>
          loadPdfPageObjectUrl(item.id, index + 1, abortController?.signal)
        )
      );
      if (run !== pdfLoadRun) return;
      pdfPageUrls = urls;
      pageCount = info.pages;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') pdfError = 'Não foi possível carregar o PDF.';
    } finally {
      if (run === pdfLoadRun) pdfLoading = false;
    }
  }

  /** Releases local Office preview resources and embedded presentation renderers. */
  function cleanupOffice() {
    officeLoadRun += 1;
    officeLoading = false;
    officeReady = false;
    try {
      officePptPreviewer?.destroy?.();
    } catch {}
    officePptPreviewer = null;
    if (officePptHost) officePptHost.innerHTML = '';
  }

  /** Chooses local Office preview loading for documents, sheets, and presentations. */
  async function loadOfficeEditor() {
    const run = ++officeLoadRun;
    officeLoading = true;
    officeReady = false;
    officeError = '';
    officeStatus = '';
    try {
      const response = await fetch(url, { cache: 'no-store', signal: abortController?.signal });
      if (!response.ok) throw new Error('Falha ao baixar o arquivo.');
      const buffer = await response.arrayBuffer();
      if (run !== officeLoadRun) return;

      if (officeKind === 'document') {
        await loadDocumentEditor(buffer);
      } else if (officeKind === 'spreadsheet') {
        await loadSpreadsheetEditor(buffer);
      } else if (officeKind === 'presentation') {
        await loadPresentationPreview(buffer);
      } else {
        officeError = 'Este formato Office ainda não é compatível com o editor local.';
      }
    } catch (error) {
      if (run === officeLoadRun) {
        officeError = error instanceof Error ? error.message : 'Não foi possível abrir o arquivo Office.';
      }
    } finally {
      if (run === officeLoadRun) {
        officeLoading = false;
        officeReady = true;
      }
    }
  }

  async function loadDocumentEditor(buffer: ArrayBuffer) {
    if (extension === 'docx') {
      const mammoth = await import('mammoth/mammoth.browser');
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
      officeDocumentHtml = result.value || '<p></p>';
      await tickFrame();
      savedOfficeDocumentText = officeDocumentText();
      return;
    }

    const preview = await officePreviewFromBuffer(item, buffer);
    if (preview.kind !== 'document') {
      officeError = 'Este formato de documento ainda nao tem visualizacao local.';
      return;
    }
    officeDocumentHtml = preview.lines.length
      ? preview.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
      : '<p></p>';
    await tickFrame();
    savedOfficeDocumentText = officeDocumentText();
  }

  async function loadSpreadsheetEditor(buffer: ArrayBuffer) {
    const XLSX = await import('xlsx');
    officeWorkbookModule = XLSX;
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true });
    officeSheets = workbook.SheetNames.map((name) => {
      const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], {
        header: 1,
        raw: false,
        blankrows: true
      });
      return { name, rows: normalizeSheetRows(rows) };
    });
    if (!officeSheets.length) officeSheets = [{ name: 'Planilha 1', rows: normalizeSheetRows([]) }];
    savedOfficeSheetsJson = JSON.stringify(officeSheets);
    initializeSheetDimensions();
    sheetColumnWidths = officeSheets.map((sheet, sheetIndex) => {
      const source = workbook.Sheets[workbook.SheetNames[sheetIndex]];
      const cols = (source?.['!cols'] as Array<{ wpx?: number }> | undefined) ?? [];
      return Array.from({ length: sheetColumnCount(sheet) }, (_, index) => cols[index]?.wpx ?? DEFAULT_SHEET_COLUMN_WIDTH);
    });
    sheetRowHeights = officeSheets.map((sheet, sheetIndex) => {
      const source = workbook.Sheets[workbook.SheetNames[sheetIndex]];
      const rows = (source?.['!rows'] as Array<{ hpx?: number }> | undefined) ?? [];
      return Array.from({ length: sheet.rows.length }, (_, index) => rows[index]?.hpx ?? DEFAULT_SHEET_ROW_HEIGHT);
    });
    resetSheetViewport();
  }

  async function loadPresentationPreview(buffer: ArrayBuffer) {
    if (extension === 'pptx') {
      const { init } = await import('pptx-preview');
      await tickFrame();
      if (!officePptHost) return;
      officePptHost.innerHTML = '';
      const previewer = init(officePptHost, {
        width: 960,
        height: 540
      });
      officePptPreviewer = previewer;
      await previewer.preview(buffer);
      officePresentationMode = 'rendered';
      return;
    }

    const preview = await officePreviewFromBuffer(item, buffer);
    if (preview.kind !== 'presentation') {
      officeError = 'Este formato de apresentacao ainda nao tem visualizacao local.';
      return;
    }
    officePresentationMode = 'outline';
    officePresentationTitle = preview.title || item.name;
    officePresentationLines = preview.lines;
  }

  /** Opens the full ONLYOFFICE editor, falling back to the local editor if remote config fails. */
  async function openFullOfficeEditor() {
    if (kind !== 'office') return;
    const run = ++fullOfficeRun;
    const shouldOpenInsideApp = isNativeMobileApp();
    const standaloneWindow = shouldOpenInsideApp ? null : window.open('about:blank', '_blank');
    fullOfficeOpen = true;
    fullOfficeMode = 'onlyoffice';
    fullOfficeLoading = true;
    fullOfficeError = '';
    fullOfficeStatus = 'Preparando ONLYOFFICE...';
    await tick();

    try {
      const response = await loadOfficeConfig(item.id, canEditText ? 'edit' : 'view');
      if (run !== fullOfficeRun) {
        standaloneWindow?.close();
        return;
      }
      if (!response.enabled || !response.documentServerUrl || !response.config) {
        standaloneWindow?.close();
        openLocalOfficeFallback(response.reason || 'ONLYOFFICE não configurado.');
        return;
      }

      const documentServerUrl = normalizeOnlyOfficeDocumentServerUrl(response.documentServerUrl);
      destroyFullOfficeEditor();
      if (run !== fullOfficeRun) {
        standaloneWindow?.close();
        return;
      }
      fullOfficeStatus = 'Abrindo editor...';
      const standaloneUrl = buildOnlyOfficeStandaloneUrl(documentServerUrl, response.config);
      if (shouldOpenInsideApp) {
        fullOfficeFrameOrigin = new URL(standaloneUrl).origin;
        fullOfficeFrameUrl = standaloneUrl;
        startOnlyOfficeReadyTimer(run);
        return;
      }
      if (standaloneWindow) {
        standaloneWindow.location.href = standaloneUrl;
        closeFullOfficeEditor(false);
        return;
      }
      openLocalOfficeFallback('O navegador bloqueou a nova aba do ONLYOFFICE.');
    } catch (error) {
      standaloneWindow?.close();
      if (run !== fullOfficeRun) return;
      openLocalOfficeFallback(error instanceof Error ? error.message : 'Não foi possível abrir o ONLYOFFICE.');
    }
  }

  /** Handles messages from the isolated ONLYOFFICE host iframe. */
  function handleOfficeHostMessage(event: MessageEvent) {
    if (typeof window === 'undefined') return;
    const data = event.data as { type?: string; key?: string; message?: string };
    const sameOriginHost = event.origin === window.location.origin && fullOfficeHostKey && data?.key === fullOfficeHostKey;
    const embeddedOnlyOfficeHost =
      Boolean(fullOfficeFrame?.contentWindow) &&
      event.source === fullOfficeFrame?.contentWindow &&
      (!fullOfficeFrameOrigin || event.origin === fullOfficeFrameOrigin);
    if (!data || (!sameOriginHost && !embeddedOnlyOfficeHost)) return;
    if (data.type === 'ride-office-ready') {
      clearOnlyOfficeReadyTimer();
      fullOfficeLoading = false;
      fullOfficeStatus = 'ONLYOFFICE pronto';
    } else if (data.type === 'ride-office-status') {
      if (data.message) fullOfficeStatus = data.message;
    } else if (data.type === 'ride-office-error') {
      clearOnlyOfficeReadyTimer();
      fullOfficeLoading = false;
      fullOfficeError = data.message || 'O ONLYOFFICE encontrou um erro ao abrir este arquivo.';
    } else if (data.type === 'ride-office-close') {
      closeFullOfficeEditor();
    }
  }

  function sendOfficeHostCommand(command: string) {
    if (!fullOfficeFrame?.contentWindow || !fullOfficeHostKey) return;
    fullOfficeFrame.contentWindow.postMessage(
      { type: 'ride-office-command', key: fullOfficeHostKey, command },
      window.location.origin
    );
  }

  /** Falls back to local preview/editing when the full editor cannot become ready. */
  function openLocalOfficeFallback(reason?: string) {
    clearOnlyOfficeReadyTimer();
    fullOfficeMode = 'local';
    fullOfficeLoading = false;
    fullOfficeError = '';
    fullOfficeStatus = reason
      ? `Editor local ativo: ${reason}`
      : officeCanSave
        ? 'Editor local com salvamento no Ride'
        : 'Visualização local';
  }

  function startOnlyOfficeReadyTimer(run: number) {
    clearOnlyOfficeReadyTimer();
    fullOfficeReadyTimer = setTimeout(() => {
      if (run !== fullOfficeRun || fullOfficeMode !== 'onlyoffice' || !fullOfficeOpen) return;
      openLocalOfficeFallback(
        'O ONLYOFFICE carregou, mas não concluiu a abertura do documento. O editor local foi ativado automaticamente.'
      );
    }, 20000);
  }

  function clearOnlyOfficeReadyTimer() {
    if (!fullOfficeReadyTimer) return;
    clearTimeout(fullOfficeReadyTimer);
    fullOfficeReadyTimer = null;
  }

  /** Clears full-editor iframe state and cancels readiness timers. */
  function destroyFullOfficeEditor() {
    clearOnlyOfficeReadyTimer();
    if (fullOfficeHostKey) sessionStorage.removeItem(`ride:office:${fullOfficeHostKey}`);
    fullOfficeHostKey = '';
    fullOfficeFrameUrl = '';
    fullOfficeFrameOrigin = '';
    fullOfficeFrame = null;
  }

  /** Closes the full Office editor and optionally asks the parent view to refresh metadata. */
  function closeFullOfficeEditor(shouldRefresh = true) {
    fullOfficeRun += 1;
    destroyFullOfficeEditor();
    syncOfficeDocumentHtml();
    fullOfficeOpen = false;
    fullOfficeLoading = false;
    fullOfficeError = '';
    fullOfficeStatus = '';
    if (shouldRefresh) dispatch('refresh');
  }

  function syncOfficeDocumentHtml() {
    if (officeKind === 'document' && officeDocumentHost) officeDocumentHtml = officeDocumentHost.innerHTML;
  }

  function markOfficeDocumentEdited() {
    markOfficeChanged();
    officeStatus = '';
  }

  function markOfficeChanged() {
    officeEditVersion += 1;
    officeStatus = '';
  }

  function initializeSheetDimensions() {
    sheetColumnWidths = officeSheets.map((sheet, sheetIndex) => {
      const existing = sheetColumnWidths[sheetIndex] ?? [];
      return Array.from({ length: sheetColumnCount(sheet) }, (_, index) => existing[index] ?? DEFAULT_SHEET_COLUMN_WIDTH);
    });
    sheetRowHeights = officeSheets.map((sheet, sheetIndex) => {
      const existing = sheetRowHeights[sheetIndex] ?? [];
      return Array.from({ length: sheet.rows.length }, (_, index) => existing[index] ?? DEFAULT_SHEET_ROW_HEIGHT);
    });
  }

  function addSheetRow() {
    const active = officeSheets[officeActiveSheet];
    if (!active) return;
    const columnCount = Math.max(1, active.rows[0]?.length ?? 1);
    pushSheetHistory(snapshotRangeCells(sheetActiveRow + 1, 0, sheetActiveRow + 1, columnCount - 1), []);
    active.rows.splice(sheetActiveRow + 1, 0, Array(columnCount).fill(''));
    sheetRowHeights[officeActiveSheet]?.splice(sheetActiveRow + 1, 0, DEFAULT_SHEET_ROW_HEIGHT);
    officeSheets = officeSheets;
    sheetRowHeights = sheetRowHeights;
    markOfficeChanged();
    selectSheetCell(sheetActiveRow + 1, sheetActiveColumn, false);
  }

  function addSheetColumn() {
    const active = officeSheets[officeActiveSheet];
    if (!active) return;
    pushSheetHistory(snapshotRangeCells(0, sheetActiveColumn + 1, Math.max(0, active.rows.length - 1), sheetActiveColumn + 1), []);
    for (const row of active.rows) row.splice(sheetActiveColumn + 1, 0, '');
    sheetColumnWidths[officeActiveSheet]?.splice(sheetActiveColumn + 1, 0, DEFAULT_SHEET_COLUMN_WIDTH);
    officeSheets = officeSheets;
    sheetColumnWidths = sheetColumnWidths;
    markOfficeChanged();
    selectSheetCell(sheetActiveRow, sheetActiveColumn + 1, false);
  }

  function clearActiveSheet() {
    if (!officeSheets[officeActiveSheet]) return;
    if (!confirm('Limpar todas as células desta planilha?')) return;
    const sheet = officeSheets[officeActiveSheet];
    pushSheetHistory(snapshotRangeCells(0, 0, Math.max(0, sheet.rows.length - 1), Math.max(0, sheetColumnCount(sheet) - 1)), []);
    officeSheets[officeActiveSheet].rows = normalizeSheetRows([]);
    officeSheets = officeSheets;
    initializeSheetDimensions();
    resetSheetViewport();
    markOfficeChanged();
  }

  function officeDocumentText() {
    return officeDocumentHost?.innerText.replace(/\u00a0/g, ' ').trimEnd() ?? '';
  }

  function tickFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  /** Picks a PDF zoom level that fits the first page into the current preview width. */
  function defaultPdfZoom() {
    if (typeof window === 'undefined') return 200;
    if (!window.matchMedia('(max-width: 768px)').matches) return 200;
    const availableWidth = Math.max(280, (pdfScroll?.clientWidth || window.innerWidth) - 24);
    return clamp(Math.floor((availableWidth / pdfPageWidth) * 100), PDF_MIN_ZOOM, 150);
  }

  /** Captures the current PDF viewport position so zoom keeps the same content under view. */
  function capturePdfZoomAnchor(): PdfZoomAnchor {
    if (!pdfScroll) return null;
    const pages = Array.from(pdfScroll.querySelectorAll<HTMLDivElement>('.pdf-page-shell'));
    if (!pages.length) return null;

    const viewport = pdfScroll.getBoundingClientRect();
    const centerX = viewport.left + viewport.width / 2;
    const centerY = viewport.top + viewport.height / 2;
    let closestPage = pages[0];
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const entry of pages) {
      const rect = entry.getBoundingClientRect();
      const pageCenterY = rect.top + rect.height / 2;
      const distance = Math.abs(pageCenterY - centerY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = entry;
      }
    }

    const rect = closestPage.getBoundingClientRect();
    return {
      pageNumber: Number(closestPage.dataset.page ?? page),
      xRatio: clamp((centerX - rect.left) / rect.width, 0, 1),
      yRatio: clamp((centerY - rect.top) / rect.height, 0, 1)
    };
  }

  /** Restores scroll position after PDF zoom using the captured page-relative anchor. */
  async function restorePdfZoomAnchor(anchor: PdfZoomAnchor) {
    if (!anchor || !pdfScroll) return;
    await tick();
    const target = pdfScroll.querySelector<HTMLDivElement>(`.pdf-page-shell[data-page="${anchor.pageNumber}"]`);
    if (!target) return;
    const viewport = pdfScroll.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const targetX = rect.left + rect.width * anchor.xRatio;
    const targetY = rect.top + rect.height * anchor.yRatio;
    pdfScroll.scrollLeft += targetX - (viewport.left + viewport.width / 2);
    pdfScroll.scrollTop += targetY - (viewport.top + viewport.height / 2);
    page = anchor.pageNumber;
  }

  /** Changes PDF zoom while preserving the user's visual anchor. */
  async function setPdfZoom(nextZoom: number) {
    const next = clamp(nextZoom, PDF_MIN_ZOOM, PDF_MAX_ZOOM);
    if (next === zoom) return;
    const anchor = capturePdfZoomAnchor();
    zoom = next;
    await restorePdfZoomAnchor(anchor);
  }

  /** Computes the natural fit width for images within the current preview viewport. */
  function defaultImageFitWidth(width: number, height: number) {
    if (typeof window === 'undefined') return width || 900;
    const availableWidth = Math.max(160, (imageScroll?.clientWidth || window.innerWidth) - 48);
    const availableHeight = Math.max(160, (imageScroll?.clientHeight || window.innerHeight) - 112);
    const widthByHeight = height > 0 ? Math.floor(width * (availableHeight / height)) : availableWidth;
    return Math.max(80, Math.min(width || availableWidth, availableWidth, widthByHeight || availableWidth));
  }

  function imageDisplayWidth() {
    return Math.round(Math.max(80, (imageFitWidth || imageNaturalWidth || 900) * (zoom / 100)));
  }

  function imageDisplayHeight() {
    if (!imageNaturalWidth || !imageNaturalHeight) return Math.round(imageDisplayWidth() * 0.66);
    return Math.round(Math.max(80, imageDisplayWidth() * (imageNaturalHeight / imageNaturalWidth)));
  }

  /** Applies explicit image dimensions so zoom changes affect layout on every browser. */
  function applyImageElementSize() {
    if (kind !== 'image') return;
    const width = imageDisplayWidth();
    const height = imageDisplayHeight();
    if (imageStage) {
      imageStage.style.width = `${width}px`;
      imageStage.style.minWidth = '100%';
      imageStage.style.height = `${height}px`;
      imageStage.style.minHeight = '100%';
    }
    if (previewImageEl) {
      previewImageEl.style.width = `${width}px`;
      previewImageEl.style.height = 'auto';
      previewImageEl.style.maxWidth = 'none';
      previewImageEl.style.maxHeight = 'none';
    }
  }

  /** Records natural image size and initializes fit-to-screen zoom. */
  async function handleImageLoad(event: Event) {
    const image = event.currentTarget as HTMLImageElement;
    await tick();
    await tickFrame();
    imageNaturalWidth = image.naturalWidth || 0;
    imageNaturalHeight = image.naturalHeight || 0;
    imageFitWidth = defaultImageFitWidth(imageNaturalWidth, imageNaturalHeight);
    zoom = 100;
    applyImageElementSize();
    await tick();
    centerImagePreview();
    setupImageResizeObserver();
  }

  /** Captures the image-relative point that should remain stable during zoom. */
  function captureImageZoomAnchor(clientX?: number, clientY?: number): ImageZoomAnchor {
    if (!imageScroll) return null;
    const image = imageScroll.querySelector<HTMLImageElement>('[data-preview-image]');
    if (!image) return null;
    const viewport = imageScroll.getBoundingClientRect();
    const rect = image.getBoundingClientRect();
    const targetX = clientX ?? viewport.left + viewport.width / 2;
    const targetY = clientY ?? viewport.top + viewport.height / 2;
    return {
      xRatio: clamp((targetX - rect.left) / rect.width, 0, 1),
      yRatio: clamp((targetY - rect.top) / rect.height, 0, 1),
      viewportX: clamp(targetX - viewport.left, 0, viewport.width),
      viewportY: clamp(targetY - viewport.top, 0, viewport.height)
    };
  }

  /** Restores image scroll offsets after zoom so wheel and pinch feel anchored. */
  async function restoreImageZoomAnchor(anchor: ImageZoomAnchor) {
    if (!anchor || !imageScroll) return;
    await tick();
    const image = imageScroll.querySelector<HTMLImageElement>('[data-preview-image]');
    if (!image) return;
    const viewport = imageScroll.getBoundingClientRect();
    const rect = image.getBoundingClientRect();
    const targetX = rect.left + rect.width * anchor.xRatio;
    const targetY = rect.top + rect.height * anchor.yRatio;
    imageScroll.scrollLeft += targetX - (viewport.left + anchor.viewportX);
    imageScroll.scrollTop += targetY - (viewport.top + anchor.viewportY);
  }

  /** Updates image zoom using explicit dimensions plus anchored scroll restoration. */
  async function setImageZoom(nextZoom: number, anchor = captureImageZoomAnchor()) {
    const next = clamp(nextZoom, PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM);
    if (next === zoom) return;
    zoom = next;
    applyImageElementSize();
    await restoreImageZoomAnchor(anchor);
  }

  function actualImageZoom() {
    if (!imageNaturalWidth || !imageFitWidth) return 100;
    return clamp((imageNaturalWidth / imageFitWidth) * 100, PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM);
  }

  function imageZoomLabel() {
    if (!imageNaturalWidth || !imageFitWidth) return `${zoom}%`;
    const actual = Math.round((imageDisplayWidth() / imageNaturalWidth) * 100);
    if (Math.abs(zoom - 100) <= 1) return 'Ajuste';
    return `${actual}%`;
  }

  /** Recomputes fit width and resets image zoom to the responsive baseline. */
  async function fitImageToScreen() {
    await setImageZoom(100);
    centerImagePreview();
  }

  async function toggleImageZoom(event: MouseEvent) {
    const anchor = captureImageZoomAnchor(event.clientX, event.clientY);
    const target = Math.abs(zoom - 100) < 8 ? actualImageZoom() : 100;
    await setImageZoom(target, anchor);
    if (target === 100) centerImagePreview();
  }

  /** Applies pointer-centered image zoom for wheel and pinch gestures. */
  async function zoomImageByFactor(factor: number, clientX?: number, clientY?: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    await setImageZoom(zoom * factor, captureImageZoomAnchor(clientX, clientY));
  }

  /** Implements ctrl/trackpad-style image zoom without hijacking normal scroll. */
  function handleImageWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.002);
    void zoomImageByFactor(factor, event.clientX, event.clientY);
  }

  function centerImagePreview() {
    if (!imageScroll) return;
    imageScroll.scrollLeft = Math.max(0, (imageScroll.scrollWidth - imageScroll.clientWidth) / 2);
    imageScroll.scrollTop = Math.max(0, (imageScroll.scrollHeight - imageScroll.clientHeight) / 2);
  }

  /** Watches the image viewport so fit-to-screen stays correct after layout changes. */
  function setupImageResizeObserver() {
    disconnectImageResizeObserver();
    observedImageScroll = imageScroll ?? null;
    if (typeof ResizeObserver === 'undefined' || !observedImageScroll) return;
    imageResizeObserver = new ResizeObserver(() => {
      void recomputeImageFitWidth();
    });
    imageResizeObserver.observe(observedImageScroll);
  }

  function disconnectImageResizeObserver() {
    imageResizeObserver?.disconnect();
    imageResizeObserver = null;
    observedImageScroll = null;
  }

  /** Recalculates fit width and preserves the actual zoom ratio across resizes. */
  async function recomputeImageFitWidth() {
    if (kind !== 'image' || !imageNaturalWidth || !imageNaturalHeight || !imageScroll) return;
    const previousFitWidth = imageFitWidth || defaultImageFitWidth(imageNaturalWidth, imageNaturalHeight);
    const previousDisplayWidth = imageDisplayWidth();
    const anchor = captureImageZoomAnchor();
    const nextFitWidth = defaultImageFitWidth(imageNaturalWidth, imageNaturalHeight);
    if (Math.abs(nextFitWidth - previousFitWidth) < 1) return;
    imageFitWidth = nextFitWidth;
    if (Math.abs(zoom - 100) > 1) {
      zoom = clamp((previousDisplayWidth / nextFitWidth) * 100, PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM);
    }
    applyImageElementSize();
    await restoreImageZoomAnchor(anchor);
    if (Math.abs(zoom - 100) <= 1) centerImagePreview();
  }

  function resetImageGestureState() {
    imagePointers = new Map();
    imagePinchStartDistance = 0;
    imagePinchStartZoom = zoom;
    imagePinchAnchor = null;
  }

  function imagePointerDistance() {
    const pointers = Array.from(imagePointers.values());
    if (pointers.length < 2) return 0;
    return Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
  }

  function imagePointerCenter() {
    const pointers = Array.from(imagePointers.values());
    if (pointers.length < 2) return null;
    return {
      x: (pointers[0].x + pointers[1].x) / 2,
      y: (pointers[0].y + pointers[1].y) / 2
    };
  }

  /** Starts two-pointer image pinch tracking without blocking single-finger panning. */
  function handleImagePointerDown(event: PointerEvent) {
    markContentPointer();
    if (event.pointerType !== 'touch') return;
    imagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imagePointers.size === 2) {
      event.preventDefault();
      imageScroll?.setPointerCapture?.(event.pointerId);
      const center = imagePointerCenter();
      imagePinchStartDistance = imagePointerDistance();
      imagePinchStartZoom = zoom;
      imagePinchAnchor = center ? captureImageZoomAnchor(center.x, center.y) : captureImageZoomAnchor();
    }
  }

  /** Updates pinch zoom from the active pointer distance and center anchor. */
  function handleImagePointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch' || !imagePointers.has(event.pointerId)) return;
    imagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imagePointers.size < 2 || !imagePinchStartDistance) return;
    event.preventDefault();
    const distance = imagePointerDistance();
    if (!distance) return;
    zoom = clamp(imagePinchStartZoom * (distance / imagePinchStartDistance), PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM);
    void restoreImageZoomAnchor(imagePinchAnchor);
  }

  function handleImagePointerEnd(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    imagePointers.delete(event.pointerId);
    if (imagePointers.size < 2) {
      imagePinchStartDistance = 0;
      imagePinchAnchor = null;
    }
  }

  function updateSheetCell(rowIndex: number, columnIndex: number, value: string) {
    setSheetCells([{ row: rowIndex, column: columnIndex, value }], true);
  }

  function setSheetCells(cells: SheetCellSnapshot[], recordHistory: boolean) {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return;
    const before = recordHistory ? cells.map((cell) => ({ ...cell, value: sheet.rows[cell.row]?.[cell.column] ?? '' })) : [];
    for (const cell of cells) {
      ensureSheetCell(sheet, cell.row, cell.column);
      sheet.rows[cell.row][cell.column] = cell.value;
    }
    officeSheets = officeSheets;
    initializeSheetDimensions();
    if (recordHistory) pushSheetHistory(before, cells);
    markOfficeChanged();
  }

  function pushSheetHistory(before: SheetCellSnapshot[], after: SheetCellSnapshot[]) {
    if (!before.length && !after.length) return;
    sheetUndoStack = [
      ...sheetUndoStack.slice(-(MAX_SHEET_HISTORY - 1)),
      {
        before,
        after,
        activeRow: sheetActiveRow,
        activeColumn: sheetActiveColumn,
        anchorRow: sheetAnchorRow,
        anchorColumn: sheetAnchorColumn
      }
    ];
    sheetRedoStack = [];
  }

  function applySheetSnapshot(cells: SheetCellSnapshot[]) {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return;
    for (const cell of cells) {
      ensureSheetCell(sheet, cell.row, cell.column);
      sheet.rows[cell.row][cell.column] = cell.value;
    }
    officeSheets = officeSheets;
    initializeSheetDimensions();
    markOfficeChanged();
  }

  function undoSheetChange() {
    const entry = sheetUndoStack.at(-1);
    if (!entry) return;
    sheetUndoStack = sheetUndoStack.slice(0, -1);
    sheetRedoStack = [...sheetRedoStack, entry];
    applySheetSnapshot(entry.before);
    selectSheetCell(entry.activeRow, entry.activeColumn);
    sheetAnchorRow = entry.anchorRow;
    sheetAnchorColumn = entry.anchorColumn;
  }

  function redoSheetChange() {
    const entry = sheetRedoStack.at(-1);
    if (!entry) return;
    sheetRedoStack = sheetRedoStack.slice(0, -1);
    sheetUndoStack = [...sheetUndoStack, entry];
    applySheetSnapshot(entry.after);
    selectSheetCell(entry.activeRow, entry.activeColumn);
    sheetAnchorRow = entry.anchorRow;
    sheetAnchorColumn = entry.anchorColumn;
  }

  function columnLabel(index: number) {
    let value = '';
    let current = index + 1;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      value = String.fromCharCode(65 + remainder) + value;
      current = Math.floor((current - 1) / 26);
    }
    return value;
  }

  function resetSheetViewport() {
    sheetRowOffset = 0;
    sheetColumnOffset = 0;
    sheetActiveRow = 0;
    sheetActiveColumn = 0;
  }

  function sheetColumnCount(sheet: SheetModel) {
    return Math.max(1, ...sheet.rows.map((row) => row.length));
  }

  function sheetColumnWidth(columnIndex: number) {
    return sheetColumnWidths[officeActiveSheet]?.[columnIndex] ?? DEFAULT_SHEET_COLUMN_WIDTH;
  }

  function sheetRowHeight(rowIndex: number) {
    return sheetRowHeights[officeActiveSheet]?.[rowIndex] ?? DEFAULT_SHEET_ROW_HEIGHT;
  }

  function sheetVisibleRows(sheet: SheetModel) {
    const end = Math.min(sheet.rows.length, sheetRowOffset + SHEET_VISIBLE_ROWS);
    return sheet.rows.slice(sheetRowOffset, end).map((row, index) => ({ row, index: sheetRowOffset + index }));
  }

  function sheetVisibleColumns(sheet: SheetModel) {
    const count = sheetColumnCount(sheet);
    const end = Math.min(count, sheetColumnOffset + SHEET_VISIBLE_COLUMNS);
    return Array.from({ length: end - sheetColumnOffset }, (_, index) => sheetColumnOffset + index);
  }

  function ensureSheetCell(sheet: SheetModel, rowIndex: number, columnIndex: number) {
    const minColumns = Math.max(sheetColumnCount(sheet), columnIndex + 1);
    while (sheet.rows.length <= rowIndex) sheet.rows.push(Array(minColumns).fill(''));
    for (const row of sheet.rows) {
      while (row.length < minColumns) row.push('');
    }
  }

  function startSheetColumnResize(event: MouseEvent, columnIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    sheetResizeState = {
      type: 'column',
      index: columnIndex,
      start: event.clientX,
      size: sheetColumnWidth(columnIndex),
      sheetIndex: officeActiveSheet
    };
  }

  function startSheetRowResize(event: MouseEvent, rowIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    sheetResizeState = {
      type: 'row',
      index: rowIndex,
      start: event.clientY,
      size: sheetRowHeight(rowIndex),
      sheetIndex: officeActiveSheet
    };
  }

  function handleSheetResizeMove(event: MouseEvent) {
    if (!sheetResizeState) return;
    const delta = sheetResizeState.type === 'column' ? event.clientX - sheetResizeState.start : event.clientY - sheetResizeState.start;
    const next = Math.max(sheetResizeState.type === 'column' ? 56 : 24, sheetResizeState.size + delta);
    if (sheetResizeState.type === 'column') {
      if (!sheetColumnWidths[sheetResizeState.sheetIndex]) sheetColumnWidths[sheetResizeState.sheetIndex] = [];
      sheetColumnWidths[sheetResizeState.sheetIndex][sheetResizeState.index] = next;
      sheetColumnWidths = sheetColumnWidths;
    } else {
      if (!sheetRowHeights[sheetResizeState.sheetIndex]) sheetRowHeights[sheetResizeState.sheetIndex] = [];
      sheetRowHeights[sheetResizeState.sheetIndex][sheetResizeState.index] = next;
      sheetRowHeights = sheetRowHeights;
    }
  }

  function stopSheetResize() {
    if (!sheetResizeState) return;
    sheetResizeState = null;
    markOfficeChanged();
  }

  function selectSheetCell(rowIndex: number, columnIndex: number, focus = true, extend = false) {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return;
    const row = Math.max(0, Math.min(rowIndex, Math.max(0, sheet.rows.length - 1)));
    const column = Math.max(0, Math.min(columnIndex, Math.max(0, sheetColumnCount(sheet) - 1)));
    if (!extend) {
      sheetAnchorRow = row;
      sheetAnchorColumn = column;
    }
    sheetActiveRow = row;
    sheetActiveColumn = column;
    if (row < sheetRowOffset) sheetRowOffset = row;
    if (row >= sheetRowOffset + SHEET_VISIBLE_ROWS) sheetRowOffset = row - SHEET_VISIBLE_ROWS + 1;
    if (column < sheetColumnOffset) sheetColumnOffset = column;
    if (column >= sheetColumnOffset + SHEET_VISIBLE_COLUMNS) sheetColumnOffset = column - SHEET_VISIBLE_COLUMNS + 1;
    if (focus) {
      void tick().then(() => {
        document.querySelector<HTMLInputElement>(`[data-sheet-cell="${row}:${column}"]`)?.focus();
      });
    }
  }

  function normalizedSheetRange() {
    return {
      startRow: Math.min(sheetAnchorRow, sheetActiveRow),
      endRow: Math.max(sheetAnchorRow, sheetActiveRow),
      startColumn: Math.min(sheetAnchorColumn, sheetActiveColumn),
      endColumn: Math.max(sheetAnchorColumn, sheetActiveColumn)
    };
  }

  function rangeAddress(range: ReturnType<typeof normalizedSheetRange>) {
    const start = cellAddress(range.startRow, range.startColumn);
    const end = cellAddress(range.endRow, range.endColumn);
    return start === end ? start : `${start}:${end}`;
  }

  function isCellSelected(rowIndex: number, columnIndex: number) {
    const range = selectedSheetRange;
    return (
      rowIndex >= range.startRow &&
      rowIndex <= range.endRow &&
      columnIndex >= range.startColumn &&
      columnIndex <= range.endColumn
    );
  }

  function snapshotRangeCells(startRow: number, startColumn: number, endRow: number, endColumn: number) {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return [];
    const cells: SheetCellSnapshot[] = [];
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row += 1) {
      for (let column = Math.min(startColumn, endColumn); column <= Math.max(startColumn, endColumn); column += 1) {
        cells.push({ row, column, value: sheet.rows[row]?.[column] ?? '' });
      }
    }
    return cells;
  }

  function selectedSheetCells() {
    const range = selectedSheetRange;
    return snapshotRangeCells(range.startRow, range.startColumn, range.endRow, range.endColumn);
  }

  function changeSheetWindow(rowDelta: number, columnDelta: number) {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return;
    sheetRowOffset = Math.max(0, Math.min(sheet.rows.length - 1, sheetRowOffset + rowDelta));
    sheetColumnOffset = Math.max(0, Math.min(Math.max(0, sheetColumnCount(sheet) - 1), sheetColumnOffset + columnDelta));
  }

  function handleSheetCellKeydown(event: KeyboardEvent, rowIndex: number, columnIndex: number) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'c') {
      event.preventDefault();
      void copySelectedSheetCells();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 'x') {
      event.preventDefault();
      void cutSelectedSheetCells();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 'v') {
      event.preventDefault();
      void pasteSheetClipboard(rowIndex, columnIndex);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoSheetChange();
      else undoSheetChange();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault();
      redoSheetChange();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === 'a') {
      event.preventDefault();
      selectUsedSheetRange();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSheetSelection(rowIndex, columnIndex, -1, 0, event.shiftKey, event.ctrlKey || event.metaKey);
    } else if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault();
      moveSheetSelection(rowIndex, columnIndex, 1, 0, event.shiftKey, event.ctrlKey || event.metaKey);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSheetSelection(rowIndex, columnIndex, 0, -1, event.shiftKey, event.ctrlKey || event.metaKey);
    } else if (event.key === 'ArrowRight' || event.key === 'Tab') {
      event.preventDefault();
      moveSheetSelection(rowIndex, columnIndex, 0, event.shiftKey && event.key === 'Tab' ? -1 : 1, event.shiftKey && event.key !== 'Tab', event.ctrlKey || event.metaKey);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectSheetCell(event.ctrlKey || event.metaKey ? 0 : rowIndex, 0, true, event.shiftKey);
    } else if (event.key === 'End') {
      event.preventDefault();
      const sheet = officeSheets[officeActiveSheet];
      if (!sheet) return;
      selectSheetCell(
        event.ctrlKey || event.metaKey ? Math.max(0, sheet.rows.length - 1) : rowIndex,
        Math.max(0, sheetColumnCount(sheet) - 1),
        true,
        event.shiftKey
      );
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelectedSheetCells();
    }
  }

  function moveSheetSelection(rowIndex: number, columnIndex: number, rowDelta: number, columnDelta: number, extend: boolean, toEdge: boolean) {
    const target = toEdge
      ? sheetEdgeCell(rowIndex, columnIndex, rowDelta, columnDelta)
      : { row: rowIndex + rowDelta, column: columnIndex + columnDelta };
    selectSheetCell(target.row, target.column, true, extend);
  }

  function sheetEdgeCell(rowIndex: number, columnIndex: number, rowDelta: number, columnDelta: number) {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return { row: rowIndex, column: columnIndex };
    if (rowDelta < 0) return { row: firstNonEmptyRow(columnIndex), column: columnIndex };
    if (rowDelta > 0) return { row: lastNonEmptyRow(columnIndex), column: columnIndex };
    if (columnDelta < 0) return { row: rowIndex, column: firstNonEmptyColumn(rowIndex) };
    if (columnDelta > 0) return { row: rowIndex, column: lastNonEmptyColumn(rowIndex) };
    return { row: rowIndex, column: columnIndex };
  }

  function firstNonEmptyRow(columnIndex: number) {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return 0;
    const found = sheet.rows.findIndex((row) => Boolean(row[columnIndex]));
    return found >= 0 ? found : 0;
  }

  function lastNonEmptyRow(columnIndex: number) {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return 0;
    for (let index = sheet.rows.length - 1; index >= 0; index -= 1) {
      if (sheet.rows[index]?.[columnIndex]) return index;
    }
    return Math.max(0, sheet.rows.length - 1);
  }

  function firstNonEmptyColumn(rowIndex: number) {
    const row = officeSheets[officeActiveSheet]?.rows[rowIndex] ?? [];
    const found = row.findIndex(Boolean);
    return found >= 0 ? found : 0;
  }

  function lastNonEmptyColumn(rowIndex: number) {
    const row = officeSheets[officeActiveSheet]?.rows[rowIndex] ?? [];
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (row[index]) return index;
    }
    return Math.max(0, row.length - 1);
  }

  function pasteSheetCells(event: ClipboardEvent, rowIndex: number, columnIndex: number) {
    const text = event.clipboardData?.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    event.preventDefault();
    pasteSheetText(text, rowIndex, columnIndex);
  }

  async function copySelectedSheetCells() {
    const text = selectedSheetText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      officeStatus = 'Não foi possível copiar para a área de transferência.';
    }
  }

  async function cutSelectedSheetCells() {
    await copySelectedSheetCells();
    clearSelectedSheetCells();
  }

  async function pasteSheetClipboard(rowIndex: number, columnIndex: number) {
    try {
      const text = await navigator.clipboard.readText();
      if (text) pasteSheetText(text, rowIndex, columnIndex);
    } catch {
      officeStatus = 'Use Ctrl+V novamente ou cole pelo menu do navegador.';
    }
  }

  function selectedSheetText() {
    const range = selectedSheetRange;
    const lines: string[] = [];
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      const cells: string[] = [];
      for (let column = range.startColumn; column <= range.endColumn; column += 1) {
        cells.push(activeSheet?.rows[row]?.[column] ?? '');
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }

  function pasteSheetText(text: string, rowIndex: number, columnIndex: number) {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return;
    const rows = text.replace(/\r/g, '').split('\n').filter((row) => row.length);
    const cells: SheetCellSnapshot[] = [];
    rows.forEach((row, rowOffset) => {
      row.split('\t').forEach((cell, columnOffset) => {
        cells.push({ row: rowIndex + rowOffset, column: columnIndex + columnOffset, value: cell });
      });
    });
    setSheetCells(cells, true);
    selectSheetCell(rowIndex + Math.max(0, rows.length - 1), columnIndex + Math.max(0, rows[0]?.split('\t').length ?? 1) - 1, true, true);
  }

  function clearSelectedSheetCells() {
    const cells = selectedSheetCells().map((cell) => ({ ...cell, value: '' }));
    setSheetCells(cells, true);
  }

  function selectUsedSheetRange() {
    const sheet = officeSheets[officeActiveSheet];
    if (!sheet) return;
    let lastRow = 0;
    let lastColumn = 0;
    sheet.rows.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (cell) {
          lastRow = Math.max(lastRow, rowIndex);
          lastColumn = Math.max(lastColumn, columnIndex);
        }
      });
    });
    sheetAnchorRow = 0;
    sheetAnchorColumn = 0;
    selectSheetCell(lastRow, lastColumn, true, true);
  }

  function sheetCellInputValue(rowIndex: number, columnIndex: number) {
    const raw = activeSheet?.rows[rowIndex]?.[columnIndex] ?? '';
    if (rowIndex === sheetActiveRow && columnIndex === sheetActiveColumn) return raw;
    return evaluatedSheetCell(rowIndex, columnIndex, new Set());
  }

  function evaluatedSheetCell(rowIndex: number, columnIndex: number, seen: Set<string>): string {
    const raw = activeSheet?.rows[rowIndex]?.[columnIndex] ?? '';
    if (!raw.startsWith('=')) return raw;
    const key = `${rowIndex}:${columnIndex}`;
    if (seen.has(key)) return '#CICLO';
    seen.add(key);
    const value = evaluateFormula(raw.slice(1), seen);
    seen.delete(key);
    return value;
  }

  function evaluateFormula(formula: string, seen: Set<string>): string {
    const expression = formula.trim();
    const fn = expression.match(/^(SUM|SOMA|AVERAGE|M[ÉE]DIA|MEDIA|MIN|MAX|COUNT|CONT\.?N[ÚU]M?)\((.*)\)$/i);
    if (fn) {
      const values = formulaArguments(fn[2]).flatMap((argument) => formulaArgumentNumbers(argument, seen));
      const name = fn[1].toUpperCase();
      if (name === 'SUM' || name === 'SOMA') return formatFormulaNumber(values.reduce((sum, value) => sum + value, 0));
      if (name === 'AVERAGE' || name === 'MÉDIA' || name === 'MEDIA') {
        return formatFormulaNumber(values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
      }
      if (name === 'MIN') return formatFormulaNumber(values.length ? Math.min(...values) : 0);
      if (name === 'MAX') return formatFormulaNumber(values.length ? Math.max(...values) : 0);
      return formatFormulaNumber(values.filter((value) => Number.isFinite(value)).length);
    }
    const ifFn = expression.match(/^(IF|SE)\((.*)\)$/i);
    if (ifFn) {
      const [condition = '', whenTrue = '', whenFalse = ''] = formulaArguments(ifFn[2]);
      return truthyFormula(condition, seen) ? formulaLiteralValue(whenTrue, seen) : formulaLiteralValue(whenFalse, seen);
    }

    const arithmetic = expression.replace(/\b([A-Z]+[0-9]+)\b/gi, (match) =>
      String(numberFromCellRef(match, seen))
    );
    if (/^[0-9+\-*/().,\s]+$/.test(arithmetic)) {
      try {
        const value = Function(`"use strict"; return (${arithmetic.replace(/,/g, '.')})`)();
        return Number.isFinite(value) ? formatFormulaNumber(value) : '#ERRO';
      } catch {
        return '#ERRO';
      }
    }
    return '#ERRO';
  }

  function truthyFormula(value: string, seen: Set<string>): boolean {
    const comparison = value.match(/^(.+?)(>=|<=|<>|=|>|<)(.+)$/);
    if (!comparison) return parseNumber(formulaLiteralValue(value, seen)) !== 0;
    const left = parseNumber(formulaLiteralValue(comparison[1], seen));
    const right = parseNumber(formulaLiteralValue(comparison[3], seen));
    const operator = comparison[2];
    if (operator === '>=') return left >= right;
    if (operator === '<=') return left <= right;
    if (operator === '<>') return left !== right;
    if (operator === '=') return left === right;
    if (operator === '>') return left > right;
    return left < right;
  }

  function formulaLiteralValue(value: string, seen: Set<string>): string {
    const trimmed = value.trim();
    const quoted = trimmed.match(/^["'](.*)["']$/);
    if (quoted) return quoted[1];
    const ref = parseCellRef(trimmed);
    if (ref) return evaluatedSheetCell(ref.row, ref.column, seen);
    if (trimmed.startsWith('=')) return evaluateFormula(trimmed.slice(1), seen);
    return trimmed;
  }

  function formulaArguments(value: string) {
    return value.split(/[;,]/).map((entry) => entry.trim()).filter(Boolean);
  }

  function formulaArgumentNumbers(argument: string, seen: Set<string>) {
    const range = argument.match(/^([A-Z]+[0-9]+):([A-Z]+[0-9]+)$/i);
    if (range) {
      const start = parseCellRef(range[1]);
      const end = parseCellRef(range[2]);
      if (!start || !end) return [];
      const values: number[] = [];
      for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
        for (let column = Math.min(start.column, end.column); column <= Math.max(start.column, end.column); column += 1) {
          values.push(numberFromCell(row, column, seen));
        }
      }
      return values;
    }
    const ref = parseCellRef(argument);
    if (ref) return [numberFromCell(ref.row, ref.column, seen)];
    return [parseNumber(argument)];
  }

  function numberFromCellRef(ref: string, seen: Set<string>) {
    const cell = parseCellRef(ref);
    return cell ? numberFromCell(cell.row, cell.column, seen) : 0;
  }

  function numberFromCell(rowIndex: number, columnIndex: number, seen: Set<string>) {
    return parseNumber(evaluatedSheetCell(rowIndex, columnIndex, seen));
  }

  function parseCellRef(ref: string) {
    const match = ref.match(/^([A-Z]+)([1-9][0-9]*)$/i);
    if (!match) return null;
    let column = 0;
    for (const char of match[1].toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64;
    return { row: Number(match[2]) - 1, column: column - 1 };
  }

  function cellAddress(rowIndex: number, columnIndex: number) {
    return `${columnLabel(columnIndex)}${rowIndex + 1}`;
  }

  function parseNumber(value: string) {
    const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function formatFormulaNumber(value: number) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  }

  function insertSumFormula() {
    insertAggregateFormula('SOMA');
  }

  function insertAggregateFormula(name: 'SOMA' | 'MÉDIA' | 'MIN' | 'MAX' | 'COUNT') {
    if (!activeSheet) return;
    if (sheetActiveRow === 0) {
      updateSheetCell(sheetActiveRow, sheetActiveColumn, `=${name}()`);
      selectSheetCell(sheetActiveRow, sheetActiveColumn);
      return;
    }
    const start = Math.max(0, sheetActiveRow - 5);
    const end = Math.max(0, sheetActiveRow - 1);
    updateSheetCell(sheetActiveRow, sheetActiveColumn, `=${name}(${cellAddress(start, sheetActiveColumn)}:${cellAddress(end, sheetActiveColumn)})`);
    selectSheetCell(sheetActiveRow, sheetActiveColumn);
  }

  function selectOfficeSheet(index: number) {
    officeActiveSheet = index;
    resetSheetViewport();
  }

  function applyDocumentCommand(command: string, value?: string) {
    if (!officeDocumentHost || !officeCanSave) return;
    officeDocumentHost.focus();
    document.execCommand(command, false, value);
    syncOfficeDocumentHtml();
    markOfficeChanged();
  }

  function applyDocumentInlineStyle(style: Partial<CSSStyleDeclaration>) {
    if (!officeDocumentHost || !officeCanSave) return;
    officeDocumentHost.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!officeDocumentHost.contains(range.commonAncestorContainer)) return;
    const span = document.createElement('span');
    Object.assign(span.style, style);
    if (range.collapsed) {
      span.appendChild(document.createTextNode('\u200b'));
      range.insertNode(span);
      range.setStart(span.firstChild ?? span, 1);
      range.collapse(true);
    } else {
      try {
        range.surroundContents(span);
      } catch {
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
      selection.removeAllRanges();
      const nextRange = document.createRange();
      nextRange.selectNodeContents(span);
      selection.addRange(nextRange);
    }
    syncOfficeDocumentHtml();
    markOfficeChanged();
  }

  function applyDocumentFontFamily(value: string) {
    documentFontFamily = value;
    applyDocumentInlineStyle({ fontFamily: value });
  }

  function applyDocumentFontSize(value: string) {
    documentFontSize = value;
    applyDocumentInlineStyle({ fontSize: value });
  }

  async function saveOffice() {
    if (kind !== 'office' || !canEditText || officeSaving || !officeDirty) return;
    officeSaving = true;
    officeError = '';
    officeStatus = 'Salvando...';
    try {
      let blob: Blob;
      let mime = item.mimeType || 'application/octet-stream';
      if (officeKind === 'document') {
        syncOfficeDocumentHtml();
        const docx = await import('docx');
        const paragraphs = officeDocumentHost
          ? documentParagraphsFromHtml(officeDocumentHost, docx)
          : officeDocumentText()
              .split(/\n+/)
              .map((line) => new docx.Paragraph(line || ' '));
        const doc = new docx.Document({
          sections: [{ children: paragraphs.length ? paragraphs : [new docx.Paragraph('')] }]
        });
        blob = await docx.Packer.toBlob(doc);
        mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (officeKind === 'spreadsheet') {
        const XLSX = officeWorkbookModule ?? (await import('xlsx'));
        const workbook = XLSX.utils.book_new();
        for (const [sheetIndex, sheet] of officeSheets.entries()) {
          const trimmedRows = trimSheetRows(sheet.rows);
          const worksheet = XLSX.utils.aoa_to_sheet(trimmedRows);
          const widths = sheetColumnWidths[sheetIndex] ?? [];
          const heights = sheetRowHeights[sheetIndex] ?? [];
          worksheet['!cols'] = widths.map((width) => ({ wpx: Math.round(width) }));
          worksheet['!rows'] = heights.map((height) => ({ hpx: Math.round(height) }));
          XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name || 'Planilha');
        }
        const bookType = spreadsheetBookType(extension);
        const output = XLSX.write(workbook, { bookType, type: 'array' });
        mime = spreadsheetMimeType(bookType, mime);
        blob = new Blob([output], { type: mime });
      } else {
        throw new Error('Este formato ainda não pode ser salvo pelo editor local.');
      }
      const updated = await saveBinaryContent(item.id, await blobToBase64(blob), mime);
      if (officeKind === 'document') savedOfficeDocumentText = officeDocumentText();
      if (officeKind === 'spreadsheet') savedOfficeSheetsJson = JSON.stringify(officeSheets);
      officeSavedEditVersion = officeEditVersion;
      officeStatus = 'Salvo';
      dispatch('updated', updated);
    } catch (error) {
      officeError = error instanceof Error ? error.message : 'Não foi possível salvar o arquivo.';
      officeStatus = '';
    } finally {
      officeSaving = false;
      setTimeout(() => {
        if (!officeDirty && officeStatus === 'Salvo') officeStatus = '';
      }, 1800);
    }
  }

  function trimSheetRows(rows: string[][]) {
    let lastRow = rows.length - 1;
    while (lastRow > 0 && rows[lastRow].every((cell) => !cell)) lastRow -= 1;
    const sliced = rows.slice(0, lastRow + 1).map((row) => {
      let lastColumn = row.length - 1;
      while (lastColumn > 0 && !row[lastColumn]) lastColumn -= 1;
      return row.slice(0, lastColumn + 1);
    });
    return sliced.length ? sliced : [['']];
  }

  function spreadsheetBookType(ext: string): 'xlsx' | 'xls' | 'xlsm' | 'xlsb' | 'ods' {
    if (ext === 'xls') return 'xls';
    if (ext === 'xlsm') return 'xlsm';
    if (ext === 'xlsb') return 'xlsb';
    if (ext === 'ods') return 'ods';
    return 'xlsx';
  }

  function spreadsheetMimeType(bookType: 'xlsx' | 'xls' | 'xlsm' | 'xlsb' | 'ods', fallback: string) {
    if (bookType === 'xls') return 'application/vnd.ms-excel';
    if (bookType === 'xlsm') return 'application/vnd.ms-excel.sheet.macroEnabled.12';
    if (bookType === 'xlsb') return 'application/vnd.ms-excel.sheet.binary.macroEnabled.12';
    if (bookType === 'ods') return 'application/vnd.oasis.opendocument.spreadsheet';
    return fallback || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  type DocxModule = typeof import('docx');
  type DocxTextStyle = {
    bold?: boolean;
    italics?: boolean;
    underline?: boolean;
    font?: string;
    size?: number;
  };

  function documentParagraphsFromHtml(root: HTMLElement, docx: DocxModule): any[] {
    const blockNodes = Array.from(root.childNodes).filter((node) => node.textContent?.trim() || node.nodeName === 'BR');
    const nodes = blockNodes.length ? blockNodes : [document.createTextNode(root.innerText || '')];
    return nodes.flatMap((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        return text ? [new docx.Paragraph({ children: [new docx.TextRun(text)] })] : [];
      }
      if (!(node instanceof HTMLElement)) return [];
      if (node.matches('ul,ol')) {
        return Array.from(node.children).map(
          (child) =>
            new docx.Paragraph({
              children: docxRunsFromNode(child, docx, {}),
              bullet: node.matches('ul') ? { level: 0 } : undefined
            })
        );
      }
      return [
        new docx.Paragraph({
          children: docxRunsFromNode(node, docx, {}),
          alignment: docxAlignmentFromElement(node, docx)
        })
      ];
    });
  }

  function docxRunsFromNode(node: Node, docx: DocxModule, inherited: DocxTextStyle): any[] {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\u200b/g, '') ?? '';
      return text ? [new docx.TextRun(docxRunOptions(text, inherited))] : [];
    }
    if (!(node instanceof HTMLElement)) return [];
    if (node.tagName === 'BR') return [new docx.TextRun({ text: '', break: 1 })];
    const style = docxStyleFromElement(node, inherited);
    const children = Array.from(node.childNodes).flatMap((child) => docxRunsFromNode(child, docx, style));
    return children.length ? children : [new docx.TextRun(docxRunOptions(node.innerText || ' ', style))];
  }

  function docxRunOptions(text: string, style: DocxTextStyle) {
    return {
      text,
      bold: style.bold || undefined,
      italics: style.italics || undefined,
      underline: style.underline ? {} : undefined,
      font: style.font || undefined,
      size: style.size || undefined
    };
  }

  function docxStyleFromElement(element: HTMLElement, inherited: DocxTextStyle): DocxTextStyle {
    const tag = element.tagName.toLowerCase();
    const fontSize = element.style.fontSize ? Math.round(parseFloat(element.style.fontSize) * 1.5) : inherited.size;
    const fontFamily = element.style.fontFamily
      ? element.style.fontFamily.split(',')[0].replace(/["']/g, '').trim()
      : inherited.font;
    return {
      ...inherited,
      bold: inherited.bold || tag === 'b' || tag === 'strong' || element.style.fontWeight === 'bold',
      italics: inherited.italics || tag === 'i' || tag === 'em' || element.style.fontStyle === 'italic',
      underline: inherited.underline || tag === 'u' || element.style.textDecoration.includes('underline'),
      font: fontFamily || inherited.font,
      size: fontSize || inherited.size
    };
  }

  function docxAlignmentFromElement(element: HTMLElement, docx: DocxModule) {
    const align = element.style.textAlign;
    if (align === 'center') return docx.AlignmentType.CENTER;
    if (align === 'right') return docx.AlignmentType.RIGHT;
    if (align === 'justify') return docx.AlignmentType.JUSTIFIED;
    return undefined;
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function blobToBase64(blob: Blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  function updateVisiblePage() {
    if (!pdfScroll) return;
    const pages = Array.from(pdfScroll.querySelectorAll<HTMLDivElement>('.pdf-page-shell'));
    const scrollTop = pdfScroll.getBoundingClientRect().top;
    let bestPage = page;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entry of pages) {
      const distance = Math.abs(entry.getBoundingClientRect().top - scrollTop - 14);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = Number(entry.dataset.page ?? '1');
      }
    }
    page = bestPage;
  }

  function close() {
    if (fullOfficeOpen) {
      closeFullOfficeEditor();
      return;
    }
    if (textDirty && !confirm('Há alterações não salvas. Fechar mesmo assim?')) return;
    if (officeDirty && !confirm('Há alterações não salvas. Fechar mesmo assim?')) return;
    dispatch('close');
  }

  function markContentPointer() {
    pointerStartedOnBackdrop = false;
  }

  function backdropPointerDown() {
    pointerStartedOnBackdrop = true;
  }

  function backdropPointerUp() {
    if (!pointerStartedOnBackdrop) return;
    pointerStartedOnBackdrop = false;
    close();
  }

  function previous() {
    if (textDirty && !confirm('Há alterações não salvas. Trocar de arquivo mesmo assim?')) return;
    if (officeDirty && !confirm('Há alterações não salvas. Trocar de arquivo mesmo assim?')) return;
    if (previousItem) dispatch('navigate', previousItem);
  }

  function next() {
    if (textDirty && !confirm('Há alterações não salvas. Trocar de arquivo mesmo assim?')) return;
    if (officeDirty && !confirm('Há alterações não salvas. Trocar de arquivo mesmo assim?')) return;
    if (nextItem) dispatch('navigate', nextItem);
  }

  async function saveText() {
    if (kind !== 'text' || textSaving || !textDirty || !canEditText) return;
    textSaving = true;
    textError = '';
    textStatus = 'Salvando...';
    try {
      const updated = await saveTextContent(item.id, textContent);
      savedTextContent = textContent;
      textStatus = 'Salvo';
      dispatch('updated', updated);
    } catch (error) {
      textError = error instanceof Error ? error.message : 'Não foi possível salvar o texto.';
      textStatus = '';
    } finally {
      textSaving = false;
      setTimeout(() => {
        if (!textDirty && textStatus === 'Salvo') textStatus = '';
      }, 1800);
    }
  }

  async function zoomOut() {
    if (kind === 'pdf') {
      await setPdfZoom(zoom - PDF_ZOOM_STEP);
      return;
    }
    if (kind === 'image') {
      await setImageZoom(zoom - PREVIEW_ZOOM_STEP);
      return;
    }
    zoom = clamp(zoom - PREVIEW_ZOOM_STEP, PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM);
  }

  async function zoomIn() {
    if (kind === 'pdf') {
      await setPdfZoom(zoom + PDF_ZOOM_STEP);
      return;
    }
    if (kind === 'image') {
      await setImageZoom(zoom + PREVIEW_ZOOM_STEP);
      return;
    }
    zoom = clamp(zoom + PREVIEW_ZOOM_STEP, PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM);
  }

  function prevPage() {
    scrollToPdfPage(Math.max(1, page - 1));
  }

  function nextPage() {
    scrollToPdfPage(pageCount ? Math.min(pageCount, page + 1) : page + 1);
  }

  function scrollToPdfPage(pageNumber: number) {
    const target = pdfHost?.querySelector<HTMLDivElement>(`[data-page="${pageNumber}"]`);
    if (!target) return;
    page = pageNumber;
    target.scrollIntoView({ block: 'start', inline: 'center', behavior: 'smooth' });
  }

  function handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const isEditingText =
      kind === 'text' &&
      (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.isContentEditable);
    if (fullOfficeOpen) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (fullOfficeMode === 'onlyoffice') {
          try {
            sendOfficeHostCommand('forceSave');
            fullOfficeStatus = 'Solicitando salvamento...';
          } catch {
            fullOfficeStatus = 'O ONLYOFFICE salva automaticamente ao fechar ou após edição.';
          }
        } else {
          void saveOffice();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeFullOfficeEditor();
      }
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 's' &&
      kind === 'office' &&
      officeCanSave
    ) {
      event.preventDefault();
      void saveOffice();
      return;
    }
    if (kind === 'office' && event.key !== 'Escape') return;
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 's' &&
      kind === 'text' &&
      textEditing &&
      canEditText
    ) {
      event.preventDefault();
      void saveText();
      return;
    }
    if (isEditingText && !event.ctrlKey && !event.metaKey && !event.altKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      previous();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === '-' && canZoom) {
      event.preventDefault();
      zoomOut();
    } else if ((event.key === '+' || event.key === '=') && canZoom) {
      event.preventDefault();
      zoomIn();
    }
  }

  onMount(() => {
    window.addEventListener('message', handleOfficeHostMessage);
    return () => window.removeEventListener('message', handleOfficeHostMessage);
  });

  onDestroy(() => {
    abortController?.abort();
    cleanupPdf();
    cleanupOffice();
    disconnectImageResizeObserver();
    destroyFullOfficeEditor();
    syncOfficeDocumentHtml();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
</script>

<svelte:window on:keydown={handleKeydown} on:mousemove={handleSheetResizeMove} on:mouseup={stopSheetResize} />

<div
  data-file-preview
  class="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-[rgba(32,33,36,0.88)] text-white"
  role="dialog"
  aria-modal="true"
  aria-label="Visualizador de arquivo"
  tabindex="-1"
>
  <header data-preview-header class="flex h-[58px] shrink-0 items-center justify-between gap-4 px-4">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      {#if showClose}
        <button
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#e8eaed] hover:bg-white/10"
          on:click={close}
          aria-label="Fechar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z"
            />
          </svg>
        </button>
      {/if}
      <FileIcon {item} size={22} />
      <div class="min-w-0 text-[18px] text-[#e8eaed]">
        <span class="truncate align-middle">{item.name}</span>
        {#if extension}
          <span class="ml-2 text-[#9aa0a6]">{extension}</span>
        {/if}
      </div>
    </div>

    {#if kind === 'office'}
      <button
        class="hidden h-10 min-w-[280px] items-center justify-between overflow-hidden rounded-full border border-[#8b8d90] bg-[#202124] text-[15px] text-[#e8eaed] shadow-sm hover:bg-[#2b2c2f] disabled:cursor-wait disabled:opacity-70 md:flex"
        aria-label={`Abrir no editor ${officeAppName()}`}
        on:click={openFullOfficeEditor}
      >
        <span class="flex min-w-0 items-center gap-3 px-5">
          <span
            class="flex h-5 w-5 items-center justify-center rounded-sm text-[13px] font-bold text-white"
            style="background:{officeAppColor()}"
          >
            {officeAppGlyph()}
          </span>
          <span class="truncate">Abrir no {officeAppName()}</span>
        </span>
        <span class="flex h-full w-11 items-center justify-center border-l border-[#8b8d90]">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h8v2H8V8zm0 4h8v2H8v-2z" />
          </svg>
        </span>
      </button>
    {/if}

    <div class="flex min-w-0 flex-1 items-center justify-end gap-1">
      <button class="preview-icon hidden lg:flex" on:click={printCurrentFile} aria-label="Imprimir">{@render PrintIcon()}</button>
      {#if kind === 'text' && canEditText}
        <button
          class="preview-icon flex {textEditing ? 'bg-white/15 text-white' : ''}"
          on:click={() => (textEditing = true)}
          aria-label="Editar texto"
          title="Editar"
        >
          {@render EditIcon()}
        </button>
      {/if}
      {#if kind === 'text' && textEditing}
        <button
          class="mr-1 flex h-10 items-center rounded-full px-4 text-[15px] font-medium {textDirty
            ? 'bg-[#0b79d0] text-white hover:bg-[#096fbe]'
            : 'bg-white/10 text-[#bdc1c6]'} disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!textDirty || textSaving}
          on:click={saveText}
          aria-label="Salvar texto"
        >
          {textSaving ? 'Salvando...' : 'Salvar'}
        </button>
        {#if textStatus}
          <span class="hidden min-w-[48px] text-[13px] text-[#bdc1c6] md:inline">{textStatus}</span>
        {/if}
      {/if}
      {#if kind === 'office' && officeCanSave && (officeKind === 'document' || officeKind === 'spreadsheet')}
        <button
          class="mr-1 flex h-10 items-center rounded-full px-4 text-[15px] font-medium {officeDirty
            ? 'bg-[#0b79d0] text-white hover:bg-[#096fbe]'
            : 'bg-white/10 text-[#bdc1c6]'} disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!officeDirty || officeSaving || officeLoading}
          on:click={saveOffice}
          aria-label="Salvar arquivo Office"
        >
          {officeSaving ? 'Salvando...' : 'Salvar'}
        </button>
        {#if officeStatus}
          <span class="hidden min-w-[48px] text-[13px] text-[#bdc1c6] md:inline">{officeStatus}</span>
        {/if}
      {/if}
      <button class="preview-icon flex" on:click={() => dispatch('download', item)} aria-label="Baixar">
        {@render DownloadIcon()}
      </button>
      <button class="preview-icon flex" on:click|stopPropagation={() => dispatch('more', item)} aria-label="Mais ações">{@render MoreIcon()}</button>
      {#if canShare}
        <button
          class="ml-3 flex h-10 items-center overflow-hidden rounded-full bg-[#0b79d0] text-[15px] font-medium text-white hover:bg-[#096fbe]"
          on:click={() => dispatch('share', item)}
        >
          <span class="flex items-center gap-2 px-5">
            {@render GlobeIcon()}
            Compartilhar
          </span>
          <span class="flex h-full w-10 items-center justify-center border-l border-black/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </span>
        </button>
      {/if}
    </div>
  </header>

  <div data-preview-body class="relative min-h-0 flex-1 overflow-hidden">
    {#if previousItem}
      <button
        class="absolute left-3 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#111315] text-white hover:bg-[#202124]"
        on:click={previous}
        aria-label="Arquivo anterior"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
      </button>
    {/if}

    {#if nextItem}
      <button
        class="absolute right-3 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#111315] text-white hover:bg-[#202124]"
        on:click={next}
        aria-label="Próximo arquivo"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" />
        </svg>
      </button>
    {/if}

    {#if kind === 'pdf'}
      <div
        data-pdf-scroll
        bind:this={pdfScroll}
        class="h-full overflow-auto px-16 pb-20 pt-1"
        role="presentation"
        on:pointerdown={backdropPointerDown}
        on:pointerup={backdropPointerUp}
        on:scroll={updateVisiblePage}
      >
        {#if pdfRawPreviewUrl}
          <iframe
            src={pdfRawPreviewUrl}
            title={item.name}
            role="document"
            class="mx-auto h-[calc(100vh-140px)] w-full max-w-[980px] rounded bg-white shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
            on:pointerdown|stopPropagation={markContentPointer}
            on:pointerup|stopPropagation
          ></iframe>
        {:else if pdfLoading || (!firstPdfPageReady && !pdfError)}
          <div class="mx-auto mt-24 w-fit rounded-full bg-black/70 px-5 py-2 text-[14px] text-white">
            Carregando PDF...
          </div>
        {:else if pdfError}
          <div
            class="mx-auto mt-24 w-fit rounded-2xl bg-[#202124] px-8 py-7 text-center text-[16px] text-white shadow-xl"
            on:pointerdown|stopPropagation={markContentPointer}
            on:pointerup|stopPropagation
            role="presentation"
          >
            {pdfError}
          </div>
        {/if}
        <div bind:this={pdfHost} class="mx-auto flex w-max min-w-full flex-col items-center">
          {#if pageCount && !pdfRawPreviewUrl}
            {#each Array(pageCount) as _, index (index)}
              {@const pageNumber = index + 1}
              <div
                class="pdf-page-shell mx-auto mb-4 flex items-center justify-center bg-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                data-page={pageNumber}
                style="width:{Math.round(pdfPageWidth * (zoom / 100))}px;min-height:{Math.round(
                  pdfPageHeight * (zoom / 100)
                )}px;--pdf-page-aspect:{pdfPageWidth} / {pdfPageHeight}"
                role="presentation"
                on:pointerdown|stopPropagation={markContentPointer}
                on:pointerup|stopPropagation
              >
                <img
                  src={pdfPageUrls[index] ?? ''}
                  alt=""
                  draggable="false"
                  loading={pageNumber <= 2 ? 'eager' : 'lazy'}
                  class="w-full select-none bg-white object-contain"
                  on:load={() => {
                    if (pageNumber === 1) firstPdfPageReady = true;
                  }}
                  on:error={() => {
                    if (pageNumber === 1) {
                      firstPdfPageReady = true;
                      pdfError = 'Não foi possível renderizar a primeira página do PDF.';
                    }
                  }}
                />
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {:else if kind === 'text'}
      <div
        data-text-preview
        class="h-full overflow-auto px-16 pb-20 pt-1"
        role="presentation"
        on:pointerdown={backdropPointerDown}
        on:pointerup={backdropPointerUp}
      >
        <div
          data-text-page
          class="mx-auto min-h-[calc(100vh-122px)] bg-white px-6 py-5 text-black shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
          style="width:{Math.round(1500 * (zoom / 100))}px;max-width:calc(100vw - 220px)"
          role="presentation"
          on:pointerdown|stopPropagation={markContentPointer}
          on:pointerup|stopPropagation
        >
          {#if textLoading}
            <div class="text-[15px] text-[#5f6368]">Carregando...</div>
          {:else if textError}
            <div class="text-[15px] text-[#d93025]">{textError}</div>
          {:else if textEditing}
            <textarea
              bind:value={textContent}
              spellcheck="false"
              class="block min-h-[calc(100vh-170px)] w-full resize-none border-0 bg-transparent font-mono text-[15px] leading-[1.45] text-black outline-none"
              aria-label="Editor de texto"
            ></textarea>
          {:else}
            <pre
              class="m-0 min-h-[calc(100vh-170px)] whitespace-pre-wrap break-words font-mono text-[15px] leading-[1.45] text-black"
            >{textContent}</pre>
          {/if}
        </div>
      </div>
    {:else if kind === 'office'}
      <div data-office-preview class="relative h-full bg-[#111315] px-3 pb-3 pt-1">
        {#if officeLoading && !officeReady}
          <div class="absolute left-1/2 top-8 z-10 -translate-x-1/2 rounded-full bg-black/70 px-5 py-2 text-[14px] text-white">
            Carregando arquivo Office...
          </div>
        {/if}
        {#if officeError}
          <div class="absolute inset-0 z-20 flex items-center justify-center bg-[#111315] px-8 text-center">
            <div class="max-w-[560px] rounded-2xl bg-[#202124] px-8 py-7 text-white shadow-xl">
              <FileIcon {item} size={52} />
              <div class="mt-4 text-[18px] font-medium">Não foi possível abrir no editor local.</div>
              <div class="mt-2 text-[14px] leading-5 text-[#bdc1c6]">{officeError}</div>
              <button
                class="mt-5 rounded-full bg-[#0b79d0] px-5 py-2 text-[15px] font-medium hover:bg-[#096fbe]"
                on:click={() => dispatch('download', item)}
              >
                Baixar arquivo
              </button>
            </div>
          </div>
        {/if}
        {#if officeKind === 'document'}
          <div data-office-document-scroll class="h-full overflow-auto px-16 pb-20">
            <div
              bind:this={officeDocumentHost}
              class="office-document mx-auto min-h-[calc(100vh-122px)] w-[860px] max-w-[calc(100vw-220px)] bg-white px-14 py-12 text-black shadow-[0_10px_28px_rgba(0,0,0,0.32)] outline-none"
              contenteditable={officeCanSave && !officeError}
              role="textbox"
              tabindex="0"
              aria-label="Editor DOCX"
              on:pointerdown|stopPropagation={markContentPointer}
              on:pointerup|stopPropagation
              on:input={markOfficeDocumentEdited}
            >
              {@html officeDocumentHtml}
            </div>
          </div>
        {:else if officeKind === 'spreadsheet'}
          <div class="flex h-full flex-col overflow-hidden rounded-lg bg-[#111315] text-[#e8eaed]">
            <div data-local-sheet-tabs class="flex h-11 shrink-0 items-center gap-2 border-b border-[#3c4043] px-3">
              {#each officeSheets as sheet, index (sheet.name + index)}
                <button
                  class="h-8 rounded-full px-3 text-[13px] {officeActiveSheet === index
                    ? 'bg-[#0b79d0] text-white'
                    : 'text-[#bdc1c6] hover:bg-white/10'}"
                  on:click={() => selectOfficeSheet(index)}
                >
                  {sheet.name}
                </button>
              {/each}
            </div>
            <div class="min-h-0 flex-1 overflow-auto">
              {#if officeSheets[officeActiveSheet]}
                <table class="office-sheet min-w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th class="sticky left-0 top-0 z-20 h-8 w-12 bg-[#202124]"></th>
                      {#each visibleSheetColumns as columnIndex}
                        <th
                          class="sticky top-0 z-10 h-8 relative border border-[#3c4043] bg-[#202124] px-2 text-center font-medium text-[#bdc1c6]"
                          style="width:{sheetColumnWidth(columnIndex)}px;min-width:{sheetColumnWidth(columnIndex)}px"
                        >
                          {columnLabel(columnIndex)}
                        </th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody>
                    {#each visibleSheetRows as entry (entry.index)}
                      <tr>
                        <th
                          class="sticky left-0 z-10 relative border border-[#3c4043] bg-[#202124] px-2 text-center font-medium text-[#bdc1c6]"
                          style="height:{sheetRowHeight(entry.index)}px"
                        >
                          {entry.index + 1}
                        </th>
                        {#each visibleSheetColumns as columnIndex}
                          <td
                            class="border border-[#3c4043] bg-[#111315] p-0 {isCellSelected(entry.index, columnIndex)
                              ? 'outline outline-1 outline-[#8ab4f8]'
                              : ''}"
                            style="width:{sheetColumnWidth(columnIndex)}px;min-width:{sheetColumnWidth(columnIndex)}px;height:{sheetRowHeight(entry.index)}px"
                          >
                            <input
                              class="h-full w-full bg-transparent px-2 text-[#e8eaed] outline-none focus:bg-[#202124] focus:ring-1 focus:ring-[#8ab4f8]"
                              data-sheet-cell={`${entry.index}:${columnIndex}`}
                              value={sheetCellInputValue(entry.index, columnIndex)}
                              readonly={!canEditText}
                              on:mousedown={(event) => {
                                event.preventDefault();
                                selectSheetCell(entry.index, columnIndex, true, event.shiftKey);
                              }}
                              on:keydown={(event) => handleSheetCellKeydown(event, entry.index, columnIndex)}
                              on:paste={(event) => pasteSheetCells(event, entry.index, columnIndex)}
                              on:input={(event) =>
                                updateSheetCell(entry.index, columnIndex, (event.currentTarget as HTMLInputElement).value)}
                            />
                          </td>
                        {/each}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </div>
          </div>
        {:else if officeKind === 'presentation'}
          {#if officePresentationMode === 'outline'}
            <div class="flex h-full items-center justify-center overflow-auto px-10 py-8">
              <div class="aspect-video w-[960px] max-w-[calc(100vw-140px)] rounded-lg bg-white p-12 text-[#202124] shadow-[0_10px_28px_rgba(0,0,0,0.32)]">
                <div class="mb-7 truncate text-[34px] font-medium text-[#b06000]">{officePresentationTitle || item.name}</div>
                <div class="space-y-4">
                  {#each officePresentationLines.length ? officePresentationLines : ['Sem texto extraido deste slide.'] as line}
                    <div class="flex items-start gap-3 text-[20px] leading-7">
                      <span class="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#e8710a]"></span>
                      <span>{line}</span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {:else}
            <div class="h-full overflow-auto rounded-lg bg-[#111315] px-10 py-8">
              <div bind:this={officePptHost} class="mx-auto w-fit"></div>
            </div>
          {/if}
        {/if}
      </div>
    {:else if kind === 'image'}
      <div
        data-image-scroll
        bind:this={imageScroll}
        class="h-full overflow-auto px-16 pb-20 pt-4"
        role="presentation"
        on:wheel={handleImageWheel}
        on:pointerdown={handleImagePointerDown}
        on:pointermove={handleImagePointerMove}
        on:pointerup={handleImagePointerEnd}
        on:pointercancel={handleImagePointerEnd}
      >
        {#if imageError}
          <div class="flex h-full items-center justify-center px-8 text-center">
            <div class="rounded-2xl bg-[#202124] px-8 py-7 shadow-xl">
              <FileIcon {item} size={52} />
              <div class="mt-4 text-[18px] font-medium">{imageError}</div>
              <button
                class="mt-5 rounded-full bg-[#0b79d0] px-5 py-2 text-[15px] font-medium hover:bg-[#096fbe]"
                on:click={() => dispatch('download', item)}
              >
                Baixar arquivo
              </button>
            </div>
          </div>
        {:else if imageLoading || !objectUrl}
          <div class="flex h-full items-center justify-center text-[15px] text-[#bdc1c6]">Carregando imagem...</div>
        {:else}
          <div
            bind:this={imageStage}
            class="flex items-center justify-center"
            style="width:{imageDisplayWidth()}px;min-width:100%;height:{imageDisplayHeight()}px;min-height:100%;"
          >
            <img
              bind:this={previewImageEl}
              data-preview-image
              src={objectUrl}
              alt={item.name}
              draggable="false"
              class="select-none shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
              style="width:{imageDisplayWidth()}px;max-width:none;height:auto;max-height:none"
              on:load={handleImageLoad}
              on:dblclick={toggleImageZoom}
              on:pointerdown|stopPropagation={handleImagePointerDown}
              on:pointermove|stopPropagation={handleImagePointerMove}
              on:pointerup|stopPropagation={handleImagePointerEnd}
              on:pointercancel|stopPropagation={handleImagePointerEnd}
              on:error={() => (imageError = 'Não foi possível carregar a imagem.')}
            />
          </div>
        {/if}
      </div>
    {:else if kind === 'video'}
      <div class="flex h-full items-center justify-center px-16 pb-20 pt-4">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video class="max-h-full max-w-full shadow-[0_10px_28px_rgba(0,0,0,0.32)]" src={url} controls autoplay></video>
      </div>
    {:else}
      <div class="flex h-full items-center justify-center px-8 text-center">
        <div class="rounded-2xl bg-[#202124] px-8 py-7 shadow-xl">
          <FileIcon {item} size={52} />
          <div class="mt-4 text-[18px] font-medium">Este tipo de arquivo ainda não tem visualização.</div>
          <button
            class="mt-5 rounded-full bg-[#0b79d0] px-5 py-2 text-[15px] font-medium hover:bg-[#096fbe]"
            on:click={() => dispatch('download', item)}
          >
            Baixar arquivo
          </button>
        </div>
      </div>
    {/if}
  </div>

  {#if fullOfficeOpen}
    <div data-full-office class="absolute inset-0 z-40 flex flex-col bg-[#111315] text-white">
      <header data-full-office-header class="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#17191c] px-4">
        <button
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#e8eaed] hover:bg-white/10"
          on:click={() => closeFullOfficeEditor()}
          aria-label="Fechar editor completo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z"
            />
          </svg>
        </button>
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[16px] font-bold text-white"
          style="background:{officeAppColor()}"
        >
          {officeAppGlyph()}
        </span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-[15px] font-medium text-[#f1f3f4]">{item.name}</div>
          <div class="truncate text-[12px] text-[#9aa0a6]">
            {fullOfficeMode === 'onlyoffice'
              ? `ONLYOFFICE ${officeAppName()} com salvamento integrado no Ride`
              : `Editor local ${officeAppName()} com salvamento integrado no Ride`}
          </div>
        </div>
        {#if fullOfficeStatus}
          <span class="hidden max-w-[220px] truncate text-[13px] text-[#bdc1c6] md:inline">{fullOfficeStatus}</span>
        {/if}
        <button class="preview-icon flex" on:click|stopPropagation={() => dispatch('more', item)} aria-label="Mais ações">
          {@render MoreIcon()}
        </button>
        {#if fullOfficeMode !== 'onlyoffice' && officeCanSave}
          <button
            class="hidden h-9 items-center rounded-full px-4 text-[14px] font-medium md:flex {officeDirty
              ? 'bg-[#0b79d0] text-white hover:bg-[#096fbe]'
              : 'border border-white/20 text-[#bdc1c6]'} disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!officeDirty || officeSaving || officeLoading}
            on:click={saveOffice}
          >
            {officeSaving ? 'Salvando...' : 'Salvar'}
          </button>
        {/if}
      </header>

      {#if fullOfficeMode === 'onlyoffice'}
        <div class="relative min-h-0 flex-1 bg-white text-[#202124]">
          {#if fullOfficeLoading}
            <div class="absolute left-1/2 top-5 z-10 -translate-x-1/2 rounded-full bg-black/75 px-5 py-2 text-[14px] text-white shadow-lg">
              {fullOfficeStatus || 'Carregando ONLYOFFICE...'}
            </div>
          {/if}
          {#if fullOfficeError}
            <div class="absolute inset-0 z-20 flex items-center justify-center bg-[#111315] px-8 text-center text-white">
              <div class="max-w-[600px] rounded-2xl bg-[#202124] px-8 py-7 shadow-xl">
                <FileIcon {item} size={52} />
                <div class="mt-4 text-[18px] font-medium">Não foi possível abrir no ONLYOFFICE.</div>
                <div class="mt-2 text-[14px] leading-5 text-[#bdc1c6]">{fullOfficeError}</div>
                <button
                  class="mt-5 rounded-full bg-[#0b79d0] px-5 py-2 text-[15px] font-medium hover:bg-[#096fbe]"
                  on:click={() => openLocalOfficeFallback(fullOfficeError)}
                >
                  Usar editor local
                </button>
              </div>
            </div>
          {/if}
          {#if fullOfficeFrameUrl}
            <iframe
              bind:this={fullOfficeFrame}
              src={fullOfficeFrameUrl}
              title={`ONLYOFFICE - ${item.name}`}
              class="h-full w-full border-0"
              allow="clipboard-read; clipboard-write; fullscreen"
            ></iframe>
          {/if}
        </div>
      {:else if officeError}
        <div class="flex min-h-0 flex-1 items-center justify-center bg-[#111315] px-8 text-center">
          <div class="max-w-[560px] rounded-2xl bg-[#202124] px-8 py-7 text-white shadow-xl">
            <FileIcon {item} size={52} />
            <div class="mt-4 text-[18px] font-medium">Não foi possível abrir no editor local.</div>
            <div class="mt-2 text-[14px] leading-5 text-[#bdc1c6]">{officeError}</div>
            <button
              class="mt-5 rounded-full bg-[#0b79d0] px-5 py-2 text-[15px] font-medium hover:bg-[#096fbe]"
              on:click={() => dispatch('download', item)}
            >
              Baixar arquivo
            </button>
          </div>
        </div>
      {:else}
        <div class="min-h-0 flex-1 bg-[#111315]">
          {#if officeKind === 'document'}
            <div class="flex h-full flex-col">
              <div data-doc-toolbar class="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 bg-[#202124] px-4">
                <button class="doc-tool" on:click={() => applyDocumentCommand('bold')} aria-label="Negrito">B</button>
                <button class="doc-tool italic" on:click={() => applyDocumentCommand('italic')} aria-label="Itálico">I</button>
                <button class="doc-tool underline" on:click={() => applyDocumentCommand('underline')} aria-label="Sublinhado">U</button>
                <span class="mx-1 h-6 w-px bg-white/15"></span>
                <select
                  class="h-8 rounded border border-white/15 bg-[#111315] px-2 text-[13px] text-[#e8eaed] outline-none"
                  value={documentFontFamily}
                  on:change={(event) => applyDocumentFontFamily((event.currentTarget as HTMLSelectElement).value)}
                  aria-label="Fonte"
                >
                  {#each DOCUMENT_FONTS as font}
                    <option value={font}>{font}</option>
                  {/each}
                </select>
                <select
                  class="h-8 rounded border border-white/15 bg-[#111315] px-2 text-[13px] text-[#e8eaed] outline-none"
                  value={documentFontSize}
                  on:change={(event) => applyDocumentFontSize((event.currentTarget as HTMLSelectElement).value)}
                  aria-label="Tamanho da fonte"
                >
                  {#each DOCUMENT_FONT_SIZES as size}
                    <option value={size}>{size.replace('px', '')}</option>
                  {/each}
                </select>
                <span class="mx-1 h-6 w-px bg-white/15"></span>
                <button class="doc-tool" on:click={() => applyDocumentCommand('justifyLeft')} aria-label="Alinhar à esquerda">L</button>
                <button class="doc-tool" on:click={() => applyDocumentCommand('justifyCenter')} aria-label="Centralizar">C</button>
                <button class="doc-tool" on:click={() => applyDocumentCommand('justifyRight')} aria-label="Alinhar à direita">R</button>
                <button class="doc-tool" on:click={() => applyDocumentCommand('insertUnorderedList')} aria-label="Lista">•</button>
                {#if officeStatus}
                  <span class="ml-auto text-[13px] text-[#bdc1c6]">{officeStatus}</span>
                {/if}
              </div>
              <div class="min-h-0 flex-1 overflow-auto px-8 py-6">
                <div
                  bind:this={officeDocumentHost}
                  class="office-document mx-auto min-h-full w-[980px] max-w-[calc(100vw-96px)] bg-white px-16 py-14 text-black shadow-[0_10px_28px_rgba(0,0,0,0.32)] outline-none"
                  contenteditable={officeCanSave && !officeError}
                  role="textbox"
                  tabindex="0"
                  aria-label="Editor DOCX em tela cheia"
                  on:input={markOfficeDocumentEdited}
                >
                  {@html officeDocumentHtml}
                </div>
              </div>
            </div>
          {:else if officeKind === 'spreadsheet'}
            <div class="flex h-full flex-col overflow-hidden text-[#e8eaed]">
              <div class="flex shrink-0 flex-col border-b border-white/10 bg-[#202124]">
                <div data-sheet-tabs class="flex h-9 items-center gap-1 px-3 text-[13px]">
                  <button class="sheet-tab sheet-tab-active">Início</button>
                  <button class="sheet-tab">Fórmulas</button>
                  <button class="sheet-tab">Dados</button>
                  <button class="sheet-tab">Exibir</button>
                  <span class="mx-2 h-5 w-px bg-white/15"></span>
                  {#each officeSheets as sheet, index (sheet.name + index)}
                    <button
                      class="h-7 rounded px-2 text-[12px] {officeActiveSheet === index
                        ? 'bg-[#188038] text-white'
                        : 'text-[#bdc1c6] hover:bg-white/10'}"
                      on:click={() => selectOfficeSheet(index)}
                    >
                      {sheet.name}
                    </button>
                  {/each}
                  {#if officeStatus}
                    <span class="ml-auto text-[13px] text-[#bdc1c6]">{officeStatus}</span>
                  {/if}
                </div>
                <div data-sheet-toolbar class="flex h-12 items-center gap-2 px-3">
                  <button class="sheet-tool" disabled={!sheetUndoStack.length} on:click={undoSheetChange}>Desfazer</button>
                  <button class="sheet-tool" disabled={!sheetRedoStack.length} on:click={redoSheetChange}>Refazer</button>
                  <button class="sheet-tool" on:click={() => void copySelectedSheetCells()}>Copiar</button>
                  <button class="sheet-tool" on:click={() => void cutSelectedSheetCells()}>Recortar</button>
                  <button class="sheet-tool" on:click={() => void pasteSheetClipboard(sheetActiveRow, sheetActiveColumn)}>Colar</button>
                  <span class="mx-1 h-7 w-px bg-white/15"></span>
                  <button class="sheet-tool" on:click={addSheetRow}>Linha</button>
                  <button class="sheet-tool" on:click={addSheetColumn}>Coluna</button>
                  <button class="sheet-tool" on:click={clearSelectedSheetCells}>Limpar célula</button>
                  <button class="sheet-tool" on:click={clearActiveSheet}>Limpar aba</button>
                  <span class="mx-1 h-7 w-px bg-white/15"></span>
                  <button class="sheet-tool" on:click={insertSumFormula}>Σ Soma</button>
                  <button class="sheet-tool" on:click={() => insertAggregateFormula('MÉDIA')}>Média</button>
                  <button class="sheet-tool" on:click={() => insertAggregateFormula('MIN')}>Mín</button>
                  <button class="sheet-tool" on:click={() => insertAggregateFormula('MAX')}>Máx</button>
                  <span class="mx-1 h-7 w-px bg-white/15"></span>
                  <button class="sheet-tool" on:click={() => changeSheetWindow(-SHEET_VISIBLE_ROWS, 0)}>↑</button>
                  <button class="sheet-tool" on:click={() => changeSheetWindow(SHEET_VISIBLE_ROWS, 0)}>↓</button>
                </div>
                <div data-formula-bar class="flex h-10 items-center gap-2 border-t border-white/10 px-3">
                  <span class="w-28 rounded border border-white/15 bg-[#111315] px-2 py-1 text-center font-mono text-[13px] text-[#bdc1c6]">
                    {selectedSheetAddress}
                  </span>
                  <span class="text-[14px] font-semibold text-[#bdc1c6]">fx</span>
                <input
                    class="h-8 min-w-[260px] flex-1 rounded border border-white/15 bg-[#111315] px-3 font-mono text-[13px] text-[#e8eaed] outline-none focus:border-[#8ab4f8]"
                  value={activeCellFormula}
                  aria-label="Barra de fórmula"
                  on:input={(event) => updateSheetCell(sheetActiveRow, sheetActiveColumn, (event.currentTarget as HTMLInputElement).value)}
                />
                </div>
              </div>
              <div class="min-h-0 flex-1 overflow-auto">
                {#if officeSheets[officeActiveSheet]}
                  <table class="office-sheet min-w-full border-collapse text-[13px]">
                    <thead>
                      <tr>
                        <th class="sticky left-0 top-0 z-20 h-8 w-12 bg-[#202124]"></th>
                        {#each visibleSheetColumns as columnIndex}
                          <th
                            class="sticky top-0 z-10 h-8 relative border border-[#3c4043] bg-[#202124] px-2 text-center font-medium text-[#bdc1c6]"
                            style="width:{sheetColumnWidth(columnIndex)}px;min-width:{sheetColumnWidth(columnIndex)}px"
                          >
                            {columnLabel(columnIndex)}
                            <button
                              type="button"
                              class="sheet-resize-x"
                              aria-label="Redimensionar coluna"
                              on:mousedown={(event) => startSheetColumnResize(event, columnIndex)}
                            ></button>
                          </th>
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each visibleSheetRows as entry (entry.index)}
                        <tr>
                          <th
                            class="sticky left-0 z-10 relative border border-[#3c4043] bg-[#202124] px-2 text-center font-medium text-[#bdc1c6]"
                            style="height:{sheetRowHeight(entry.index)}px"
                          >
                            {entry.index + 1}
                            <button
                              type="button"
                              class="sheet-resize-y"
                              aria-label="Redimensionar linha"
                              on:mousedown={(event) => startSheetRowResize(event, entry.index)}
                            ></button>
                          </th>
                          {#each visibleSheetColumns as columnIndex}
                            <td
                              class="border border-[#3c4043] bg-[#111315] p-0 {isCellSelected(entry.index, columnIndex)
                                ? 'outline outline-1 outline-[#8ab4f8]'
                                : ''}"
                              style="width:{sheetColumnWidth(columnIndex)}px;min-width:{sheetColumnWidth(columnIndex)}px;height:{sheetRowHeight(entry.index)}px"
                            >
                              <input
                                class="h-full w-full bg-transparent px-2 text-[#e8eaed] outline-none focus:bg-[#202124] focus:ring-1 focus:ring-[#8ab4f8] {entry.index === sheetActiveRow &&
                                columnIndex === sheetActiveColumn
                                  ? 'ring-1 ring-[#8ab4f8]'
                                  : ''}"
                                data-sheet-cell={`${entry.index}:${columnIndex}`}
                                value={sheetCellInputValue(entry.index, columnIndex)}
                                readonly={!canEditText}
                                on:mousedown={(event) => {
                                  event.preventDefault();
                                  selectSheetCell(entry.index, columnIndex, true, event.shiftKey);
                                }}
                                on:keydown={(event) => handleSheetCellKeydown(event, entry.index, columnIndex)}
                                on:paste={(event) => pasteSheetCells(event, entry.index, columnIndex)}
                                on:input={(event) =>
                                  updateSheetCell(entry.index, columnIndex, (event.currentTarget as HTMLInputElement).value)}
                              />
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                {/if}
              </div>
            </div>
          {:else if officeKind === 'presentation'}
            <div class="flex h-full items-center justify-center overflow-auto px-10 py-8">
              <div class="aspect-video w-[1120px] max-w-[calc(100vw-96px)] rounded-lg bg-white p-12 text-[#202124] shadow-[0_10px_28px_rgba(0,0,0,0.32)]">
                <div class="mb-7 truncate text-[34px] font-medium text-[#b06000]">{officePresentationTitle || item.name}</div>
                <div class="space-y-4">
                  {#each officePresentationLines.length ? officePresentationLines : ['Visualização local da apresentação carregada no painel principal.'] as line}
                    <div class="flex items-start gap-3 text-[20px] leading-7">
                      <span class="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#e8710a]"></span>
                      <span>{line}</span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if kind === 'pdf'}
    <div
      data-pdf-controls
      class="absolute bottom-5 left-1/2 z-30 flex h-11 -translate-x-1/2 items-center overflow-hidden rounded-full bg-[rgba(0,0,0,0.78)] text-[14px] text-white shadow-lg"
    >
      <button class="control-button" on:click={prevPage} aria-label="Página anterior">‹</button>
      <span class="px-3">Página</span>
      <span class="min-w-[28px] text-center">{page}</span>
      <span class="px-2 text-[#bdc1c6]">/</span>
      <span class="min-w-[34px] text-center">{pageCount ?? '...'}</span>
      <span class="mx-2 h-6 w-px bg-[#5f6368]"></span>
      <button class="control-button" on:click={zoomOut} aria-label="Diminuir zoom">−</button>
      <span class="pdf-zoom-label min-w-[54px] px-2 text-center text-[13px] text-[#e8eaed]">{zoom}%</span>
      <button class="control-button" on:click={zoomIn} aria-label="Aumentar zoom">+</button>
      <button class="control-button" on:click={nextPage} aria-label="Próxima página">›</button>
    </div>
  {:else if kind === 'text' || kind === 'image'}
    <div
      data-zoom-controls
      class="absolute bottom-5 left-1/2 z-30 flex h-11 -translate-x-1/2 items-center overflow-hidden rounded-full bg-[rgba(0,0,0,0.78)] text-[18px] text-white shadow-lg"
    >
      <button class="control-button" on:click={zoomOut} aria-label="Diminuir zoom">−</button>
      <span class="min-w-[64px] px-2 text-center text-[13px] text-[#e8eaed]">
        {kind === 'image' ? imageZoomLabel() : `${zoom}%`}
      </span>
      <button class="control-button" on:click={zoomIn} aria-label="Aumentar zoom">+</button>
      {#if kind === 'image'}
        <button class="control-button min-w-[72px] px-3 text-[13px]" on:click={fitImageToScreen} aria-label="Ajustar imagem à tela">
          Ajustar
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .preview-icon {
    height: 40px;
    width: 40px;
    flex: 0 0 40px;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    color: #e8eaed;
  }

  .preview-icon:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .control-button {
    display: flex;
    height: 44px;
    min-width: 44px;
    flex: 0 0 44px;
    align-items: center;
    justify-content: center;
    color: white;
    touch-action: manipulation;
    user-select: none;
  }

  .control-button:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  [data-image-scroll] {
    overscroll-behavior: contain;
    touch-action: pan-x pan-y;
  }

  [data-preview-image] {
    cursor: zoom-in;
    touch-action: pan-x pan-y;
  }

  .doc-tool {
    display: flex;
    height: 32px;
    min-width: 32px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: #e8eaed;
    font-size: 13px;
    font-weight: 700;
  }

  .doc-tool:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .sheet-tab {
    height: 28px;
    flex: 0 0 auto;
    border-radius: 6px 6px 0 0;
    padding: 0 12px;
    color: #bdc1c6;
    white-space: nowrap;
  }

  .sheet-tab:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .sheet-tab-active {
    background: #111315;
    color: #e8eaed;
  }

  .sheet-tool {
    height: 32px;
    flex: 0 0 auto;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 0 10px;
    color: #e8eaed;
    font-size: 13px;
    white-space: nowrap;
  }

  .sheet-tool:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }

  .sheet-tool:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .sheet-resize-x,
  .sheet-resize-y {
    position: absolute;
    display: block;
  }

  .sheet-resize-x {
    right: -3px;
    top: 0;
    height: 100%;
    width: 6px;
    cursor: col-resize;
  }

  .sheet-resize-y {
    bottom: -3px;
    left: 0;
    height: 6px;
    width: 100%;
    cursor: row-resize;
  }

  .office-document :global(p) {
    margin: 0 0 0.85rem;
  }

  .office-document :global(table) {
    margin: 1rem 0;
    width: 100%;
    border-collapse: collapse;
  }

  .office-document :global(td),
  .office-document :global(th) {
    border: 1px solid #dadce0;
    padding: 6px 8px;
  }

  .office-sheet input[readonly] {
    cursor: default;
  }
</style>

{#snippet CommentIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="M21 6h-2v9H7v2c0 .55.45 1 1 1h10l4 4V7c0-.55-.45-1-1-1zM17 12V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z" /></svg
  >{/snippet}
{#snippet HelpIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" /></svg
  >{/snippet}
{#snippet PrintIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zM16 19H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM18 3H6v4h12V3z" /></svg
  >{/snippet}
{#snippet EditIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path
      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
    /></svg
  >{/snippet}
{#snippet DownloadIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="M5 20h14v-2H5v2zm14-9h-4V3H9v8H5l7 7 7-7z" /></svg
  >{/snippet}
{#snippet SparkIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="m12 2 1.76 5.24L19 9l-5.24 1.76L12 16l-1.76-5.24L5 9l5.24-1.76L12 2zm7 11 1.05 3.14L23 17.2l-2.95 1.06L19 21.4l-1.05-3.14L15 17.2l2.95-1.06L19 13zM5 14l.88 2.63L8.5 17.5l-2.62.87L5 21l-.88-2.63-2.62-.87 2.62-.87L5 14z" /></svg
  >{/snippet}
{#snippet MoreIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg
  >{/snippet}
{#snippet GlobeIcon()}<svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    ><path d="M12 2a10 10 0 1 0 .01 0H12zm6.93 6h-2.95a15.6 15.6 0 0 0-1.38-3.15A8.03 8.03 0 0 1 18.93 8zM12 4.04A14.1 14.1 0 0 1 13.91 8h-3.82A14.1 14.1 0 0 1 12 4.04zM4.26 14a8.17 8.17 0 0 1 0-4h3.33a16.5 16.5 0 0 0 0 4H4.26zm.81 2h2.95c.32 1.1.79 2.16 1.38 3.15A8.03 8.03 0 0 1 5.07 16zm2.95-8H5.07A8.03 8.03 0 0 1 9.4 4.85 15.6 15.6 0 0 0 8.02 8zM12 19.96A14.1 14.1 0 0 1 10.09 16h3.82A14.1 14.1 0 0 1 12 19.96zM14.34 14H9.66A14.71 14.71 0 0 1 9.5 12c0-.69.06-1.36.16-2h4.68c.1.64.16 1.31.16 2s-.06 1.36-.16 2zm.26 5.15c.59-.99 1.06-2.05 1.38-3.15h2.95a8.03 8.03 0 0 1-4.33 3.15zM16.41 14a16.5 16.5 0 0 0 0-4h3.33a8.17 8.17 0 0 1 0 4h-3.33z" /></svg
  >{/snippet}
