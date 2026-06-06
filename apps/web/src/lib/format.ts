import type { DriveItem } from './types';

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

export function formatDriveDate(value: string) {
  const date = new Date(value);
  const currentYear = new Date().getFullYear();
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short'
  };
  if (date.getFullYear() !== currentYear) options.year = 'numeric';
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

export function fileIcon(item: DriveItem) {
  if (item.type === 'folder') return '📁';
  if (item.mimeType?.startsWith('image/')) return '🖼️';
  if (item.mimeType?.startsWith('video/')) return '🎬';
  if (item.mimeType?.includes('pdf')) return '📕';
  if (item.mimeType?.includes('spreadsheet') || item.extension === 'csv') return '📊';
  if (item.mimeType?.includes('text') || ['md', 'txt'].includes(item.extension ?? '')) return '📄';
  if (['zip', 'rar', '7z'].includes(item.extension ?? '')) return '🗜️';
  return '📦';
}
