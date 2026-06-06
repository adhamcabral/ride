import type { DriveItem } from '$lib/types';
import type { ModifiedFilterPreset } from '$lib/components/ModifiedFilterMenu.svelte';

export type TypeFilterId =
  | 'all'
  | 'folders'
  | 'documents'
  | 'spreadsheets'
  | 'presentations'
  | 'images'
  | 'pdfs'
  | 'videos'
  | 'archives'
  | 'audio'
  | 'drawings'
  | 'sites'
  | 'shortcuts'
  | 'code'
  | 'files';

export interface TypeFilterOption {
  id: TypeFilterId;
  label: string;
  glyph: string;
  bg: string;
  fg: string;
}

export const typeFilterOptions: TypeFilterOption[] = [
  { id: 'folders', label: 'Pastas', glyph: '', bg: '#9aa0a6', fg: '#111111' },
  { id: 'documents', label: 'Documentos', glyph: 'D', bg: '#8ab4f8', fg: '#174ea6' },
  { id: 'spreadsheets', label: 'Planilhas', glyph: '+', bg: '#81c995', fg: '#0d652d' },
  { id: 'presentations', label: 'Apresentações', glyph: '-', bg: '#fde293', fg: '#b06000' },
  { id: 'videos', label: 'Vídeos', glyph: '▶', bg: '#c58af9', fg: '#681da8' },
  { id: 'images', label: 'Fotos e imagens', glyph: '▴', bg: '#f28b82', fg: '#7f1d1d' },
  { id: 'pdfs', label: 'PDFs', glyph: 'PDF', bg: '#f28b82', fg: '#7f1d1d' },
  { id: 'archives', label: 'Arquivos (.zip)', glyph: '≡', bg: '#bdc1c6', fg: '#3c4043' },
  { id: 'audio', label: 'Áudio', glyph: '♫', bg: '#f28b82', fg: '#7f1d1d' },
  { id: 'drawings', label: 'Desenhos', glyph: '●', bg: '#f28b82', fg: '#7f1d1d' },
  { id: 'sites', label: 'Sites', glyph: '▣', bg: '#5f6fed', fg: '#e8f0fe' },
  { id: 'shortcuts', label: 'Atalhos', glyph: '↗', bg: '#9aa0a6', fg: '#202124' },
  { id: 'code', label: 'Código', glyph: '</>', bg: '#bdc1c6', fg: '#202124' },
  { id: 'files', label: 'Outros arquivos', glyph: 'F', bg: '#bdc1c6', fg: '#202124' }
];

function itemExtension(item: DriveItem) {
  return (item.extension || item.name.split('.').pop() || '').toLowerCase();
}

export function itemTypeFilter(item: DriveItem): TypeFilterId {
  if (item.type === 'folder') return 'folders';
  const mime = (item.mimeType || '').toLowerCase();
  const ext = itemExtension(item);

  if (mime.includes('pdf') || ext === 'pdf') return 'pdfs';
  if (
    mime.startsWith('video/') ||
    ['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'm4v', '3gp', 'mpeg', 'mpg', 'ogv'].includes(ext)
  )
    return 'videos';
  if (
    mime.startsWith('audio/') ||
    ['mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'opus', 'm4a', 'wma', 'mid', 'midi'].includes(ext)
  )
    return 'audio';
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('vnd.google-apps.spreadsheet') ||
    ['xls', 'xlsx', 'xlsm', 'csv', 'ods', 'tsv', 'gsheet', 'numbers'].includes(ext)
  )
    return 'spreadsheets';
  if (
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    mime.includes('vnd.google-apps.presentation') ||
    ['ppt', 'pptx', 'odp', 'key', 'gslides'].includes(ext)
  )
    return 'presentations';
  if (
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    mime.includes('vnd.google-apps.document') ||
    mime.startsWith('text/') ||
    ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'].includes(ext)
  )
    return 'documents';
  if (
    mime.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'heic', 'ico'].includes(ext)
  )
    return 'images';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz'].includes(ext)) return 'archives';
  if (mime.includes('drawing') || ['ai', 'psd', 'xd', 'fig', 'sketch', 'dwg'].includes(ext)) return 'drawings';
  if (mime.includes('shortcut') || ['url', 'webloc', 'lnk', 'desktop'].includes(ext)) return 'shortcuts';
  if (mime.includes('site') || ['html', 'htm'].includes(ext)) return 'sites';
  if (
    [
      'js',
      'ts',
      'jsx',
      'tsx',
      'py',
      'java',
      'c',
      'cpp',
      'go',
      'rs',
      'css',
      'json',
      'xml',
      'yml',
      'yaml',
      'sh'
    ].includes(ext)
  )
    return 'code';

  return 'files';
}

export function filterItemsByType(source: DriveItem[], typeId: TypeFilterId) {
  return typeId === 'all' ? source : source.filter((item) => itemTypeFilter(item) === typeId);
}

function localDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

export function filterItemsByModified(
  source: DriveItem[],
  preset: ModifiedFilterPreset,
  after: string | null,
  before: string | null
) {
  if (preset === 'all') return source;
  const now = new Date();
  const today = startOfDay(now);
  let from: Date | null = null;
  let to: Date | null = null;

  if (preset === 'today') {
    from = today;
    to = endOfDay(today);
  } else if (preset === 'last7') {
    from = new Date(today);
    from.setDate(from.getDate() - 6);
    to = endOfDay(today);
  } else if (preset === 'last30') {
    from = new Date(today);
    from.setDate(from.getDate() - 29);
    to = endOfDay(today);
  } else if (preset === 'thisYear') {
    from = new Date(now.getFullYear(), 0, 1);
    to = new Date(now.getFullYear() + 1, 0, 1);
  } else if (preset === 'lastYear') {
    from = new Date(now.getFullYear() - 1, 0, 1);
    to = new Date(now.getFullYear(), 0, 1);
  } else if (preset === 'custom') {
    from = after ? localDate(after) : null;
    to = before ? endOfDay(localDate(before)) : null;
  }

  return source.filter((item) => {
    const time = new Date(item.updatedAt).getTime();
    if (from && time < from.getTime()) return false;
    if (to && time >= to.getTime()) return false;
    return true;
  });
}

export function availableTypeFilters(source: DriveItem[], selectedTypeId: TypeFilterId) {
  const present = new Set(source.map((item) => itemTypeFilter(item)));
  const options = typeFilterOptions.filter((option) => present.has(option.id));
  const selectedOption = typeFilterOptions.find((option) => option.id === selectedTypeId);
  if (selectedOption && selectedTypeId !== 'all' && !options.some((option) => option.id === selectedTypeId)) {
    return [selectedOption, ...options];
  }
  return options;
}
