import type { DriveItem } from './types';

export type OfficeKind = 'document' | 'spreadsheet' | 'presentation' | 'unsupported';

export type SheetModel = {
  name: string;
  rows: string[][];
};

export type OfficeTheme = {
  label: string;
  short: string;
  color: string;
  pale: string;
};

export type OfficeThumbnailPreview =
  | { kind: 'document'; lines: string[] }
  | { kind: 'spreadsheet'; sheetName: string; rows: string[][] }
  | { kind: 'presentation'; title: string; lines: string[] }
  | { kind: 'unsupported'; reason?: string };

const MAX_THUMBNAIL_BYTES = 12 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 80;
const thumbnailCache = new Map<string, OfficeThumbnailPreview>();

export function itemExtension(item: Pick<DriveItem, 'extension' | 'name'>): string {
  return (item.extension || item.name.split('.').pop() || '').toLowerCase();
}

export function isOfficeFile(ext: string, mime: string): boolean {
  const normalizedMime = mime.toLowerCase();
  return (
    [
      'doc',
      'docx',
      'docm',
      'dot',
      'dotx',
      'odt',
      'ott',
      'rtf',
      'xls',
      'xlsx',
      'xlsm',
      'xlsb',
      'xlt',
      'xltx',
      'ods',
      'ots',
      'ppt',
      'pptx',
      'pptm',
      'pps',
      'ppsx',
      'pot',
      'potx',
      'odp',
      'otp'
    ].includes(ext) ||
    normalizedMime.includes('word') ||
    normalizedMime.includes('spreadsheet') ||
    normalizedMime.includes('presentation') ||
    normalizedMime.includes('excel') ||
    normalizedMime.includes('powerpoint') ||
    normalizedMime.includes('opendocument') ||
    normalizedMime.includes('vnd.google-apps.document') ||
    normalizedMime.includes('vnd.google-apps.spreadsheet') ||
    normalizedMime.includes('vnd.google-apps.presentation')
  );
}

export function officeKindForExtension(ext: string, mime: string): OfficeKind {
  const normalizedMime = mime.toLowerCase();
  if (
    ['doc', 'docx', 'docm', 'dot', 'dotx', 'odt', 'ott', 'rtf'].includes(ext) ||
    normalizedMime.includes('word') ||
    normalizedMime.includes('opendocument.text') ||
    normalizedMime.includes('vnd.google-apps.document')
  ) {
    return 'document';
  }
  if (
    ['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods', 'ots'].includes(ext) ||
    normalizedMime.includes('spreadsheet') ||
    normalizedMime.includes('excel') ||
    normalizedMime.includes('vnd.google-apps.spreadsheet')
  ) {
    return 'spreadsheet';
  }
  if (
    ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'pot', 'potx', 'odp', 'otp'].includes(ext) ||
    normalizedMime.includes('presentation') ||
    normalizedMime.includes('powerpoint') ||
    normalizedMime.includes('vnd.google-apps.presentation')
  ) {
    return 'presentation';
  }
  return 'unsupported';
}

export function officeKindForItem(item: Pick<DriveItem, 'extension' | 'mimeType' | 'name'>): OfficeKind {
  return officeKindForExtension(itemExtension(item), item.mimeType || '');
}

export function officeTheme(item: Pick<DriveItem, 'extension' | 'mimeType' | 'name'>): OfficeTheme {
  const ext = itemExtension(item);
  const kind = officeKindForItem(item);
  if (kind === 'spreadsheet') {
    return { label: 'Planilha', short: ext || 'XLSX', color: '#188038', pale: '#e6f4ea' };
  }
  if (kind === 'presentation') {
    return { label: 'Apresentacao', short: ext || 'PPTX', color: '#e8710a', pale: '#fef7e0' };
  }
  return { label: 'Documento', short: ext || 'DOCX', color: '#1a73e8', pale: '#e8f0fe' };
}

export function officeThumbnailCacheKey(item: DriveItem): string {
  return [item.id, item.checksum || '', item.updatedAt, item.size].join(':');
}

export async function loadOfficeThumbnailPreview(
  item: DriveItem,
  url: string,
  signal?: AbortSignal
): Promise<OfficeThumbnailPreview> {
  const key = officeThumbnailCacheKey(item);
  const cached = thumbnailCache.get(key);
  if (cached) return cached;
  if (item.size > MAX_THUMBNAIL_BYTES) return { kind: 'unsupported', reason: 'large-file' };

  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('office-preview-fetch-failed');
  const buffer = await response.arrayBuffer();
  const preview = await officePreviewFromBuffer(item, buffer);
  rememberThumbnailPreview(key, preview);
  return preview;
}

export async function officePreviewFromBuffer(item: DriveItem, buffer: ArrayBuffer): Promise<OfficeThumbnailPreview> {
  const ext = itemExtension(item);
  const kind = officeKindForItem(item);
  if (kind === 'document') return documentPreviewFromBuffer(ext, buffer);
  if (kind === 'spreadsheet') return spreadsheetPreviewFromBuffer(buffer);
  if (kind === 'presentation') return presentationPreviewFromBuffer(ext, buffer);
  return { kind: 'unsupported' };
}

export function normalizeSheetRows(rows: unknown[][], minRows = 24, minCols = 10): string[][] {
  const next = rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
  const targetRows = Math.max(minRows, next.length + 4);
  const targetCols = Math.max(minCols, ...next.map((row) => row.length + 2), minCols);
  for (let rowIndex = 0; rowIndex < targetRows; rowIndex += 1) {
    if (!next[rowIndex]) next[rowIndex] = [];
    for (let columnIndex = 0; columnIndex < targetCols; columnIndex += 1) {
      if (next[rowIndex][columnIndex] == null) next[rowIndex][columnIndex] = '';
    }
  }
  return next;
}

async function documentPreviewFromBuffer(ext: string, buffer: ArrayBuffer): Promise<OfficeThumbnailPreview> {
  if (ext === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    return { kind: 'document', lines: textLinesFromHtml(result.value, 9) };
  }

  if (ext === 'odt' || ext === 'ott') {
    const xml = await zipText(buffer, ['content.xml']);
    return xml ? { kind: 'document', lines: textLinesFromXml(xml, 9) } : { kind: 'unsupported' };
  }

  return { kind: 'unsupported' };
}

async function spreadsheetPreviewFromBuffer(buffer: ArrayBuffer): Promise<OfficeThumbnailPreview> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0] || 'Planilha 1';
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { kind: 'spreadsheet', sheetName, rows: normalizeSheetRows([], 6, 5).slice(0, 6) };

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    blankrows: false
  });
  const rows = normalizeSheetRows(rawRows.slice(0, 8), 6, 5)
    .slice(0, 6)
    .map((row) => row.slice(0, 5));
  return { kind: 'spreadsheet', sheetName, rows };
}

async function presentationPreviewFromBuffer(ext: string, buffer: ArrayBuffer): Promise<OfficeThumbnailPreview> {
  if (ext === 'pptx' || ext === 'pptm' || ext === 'ppsx') {
    const slideXml = await firstMatchingZipText(buffer, /^ppt\/slides\/slide\d+\.xml$/);
    const lines = slideXml ? textLinesFromXml(slideXml, 8) : [];
    return {
      kind: 'presentation',
      title: lines[0] || 'Slide 1',
      lines: lines.slice(1, 7)
    };
  }

  if (ext === 'odp' || ext === 'otp') {
    const xml = await zipText(buffer, ['content.xml']);
    const lines = xml ? textLinesFromXml(xml, 8) : [];
    return {
      kind: 'presentation',
      title: lines[0] || 'Slide 1',
      lines: lines.slice(1, 7)
    };
  }

  return { kind: 'unsupported' };
}

function rememberThumbnailPreview(key: string, preview: OfficeThumbnailPreview): void {
  thumbnailCache.set(key, preview);
  if (thumbnailCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = thumbnailCache.keys().next().value;
  if (oldest) thumbnailCache.delete(oldest);
}

async function zipText(buffer: ArrayBuffer, names: string[]): Promise<string | null> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  for (const name of names) {
    const file = zip.file(name);
    if (file) return file.async('text');
  }
  return null;
}

async function firstMatchingZipText(buffer: ArrayBuffer, pattern: RegExp): Promise<string | null> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files)
    .filter((name) => pattern.test(name))
    .sort((a, b) => {
      const aNumber = Number(a.match(/\d+/)?.[0] ?? 0);
      const bNumber = Number(b.match(/\d+/)?.[0] ?? 0);
      return aNumber - bNumber || a.localeCompare(b);
    });
  const first = files[0] ? zip.file(files[0]) : null;
  return first ? first.async('text') : null;
}

function textLinesFromHtml(html: string, limit: number): string[] {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return compactLines(decodeEntities(text), limit);
}

function textLinesFromXml(xml: string, limit: number): string[] {
  const taggedText = Array.from(xml.matchAll(/<(?:a:t|text:p|text:h|text:span)[^>]*>([\s\S]*?)<\/(?:a:t|text:p|text:h|text:span)>/g))
    .map((match) => match[1].replace(/<[^>]+>/g, ' '))
    .join('\n');
  const source = taggedText || xml.replace(/<[^>]+>/g, ' ');
  return compactLines(decodeEntities(source), limit);
}

function compactLines(text: string, limit: number): string[] {
  return text
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n| {2,}/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}
