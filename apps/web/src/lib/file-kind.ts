import type { DriveItem } from '$lib/types';

export const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'jpe',
  'jfif',
  'pjpeg',
  'pjp',
  'png',
  'gif',
  'webp',
  'bmp',
  'dib',
  'svg',
  'svgz',
  'tif',
  'tiff',
  'ico',
  'heic',
  'heif',
  'avif'
]);

export function fileExtension(item: DriveItem): string {
  return (item.extension || item.name.split('.').pop() || '').toLowerCase();
}

export function isImageFile(item: DriveItem): boolean {
  const mime = (item.mimeType || '').toLowerCase();
  return mime.startsWith('image/') || IMAGE_EXTENSIONS.has(fileExtension(item));
}

export function imageMimeType(item: DriveItem): string {
  const mime = (item.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return mime;
  const ext = fileExtension(item);
  if (['jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp'].includes(ext)) return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (['bmp', 'dib'].includes(ext)) return 'image/bmp';
  if (['svg', 'svgz'].includes(ext)) return 'image/svg+xml';
  if (['tif', 'tiff'].includes(ext)) return 'image/tiff';
  if (ext === 'ico') return 'image/x-icon';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  return 'image/*';
}
