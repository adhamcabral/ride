import type {
  DriveItem,
  OfficeEditorConfigResponse,
  SharePermission,
  StorageSummary
} from '$lib/types';
import { getApiUrl, request } from './core';

type FileAccessTicketScope = 'download' | 'preview' | 'pdf-page';
type FileAccessTicket = { ticket: string; expiresAt: number };
const ticketCache = new Map<string, FileAccessTicket>();

async function fileAccessUrl(itemId: string, path: string, scope: FileAccessTicketScope) {
  const cacheKey = `${itemId}:${scope}`;
  const cached = ticketCache.get(cacheKey);
  const ticket =
    cached && cached.expiresAt - Date.now() > 30_000
      ? cached
      : await request<FileAccessTicket>(`/files/${itemId}/access-ticket`, {
          method: 'POST',
          body: JSON.stringify({ scope })
        });
  ticketCache.set(cacheKey, ticket);
  return `${getApiUrl()}${path}?_ticket=${encodeURIComponent(ticket.ticket)}`;
}

export function listItems(params: Record<string, string | boolean | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  });
  return request<DriveItem[]>(`/library?${query.toString()}`);
}

export function getBreadcrumbs(folderId: string | null) {
  if (!folderId) return Promise.resolve([] as DriveItem[]);
  return request<DriveItem[]>(`/files/${folderId}/breadcrumbs`);
}

export function getItem(itemId: string) {
  return request<DriveItem>(`/files/${itemId}`);
}

export function markItemOpened(itemId: string) {
  return request<DriveItem>(`/files/${itemId}/opened`, { method: 'POST' });
}

export function getSummary(ownerId: string) {
  return request<StorageSummary>(`/storage/summary?ownerId=${ownerId}`);
}

export function listFolders(ownerId: string) {
  return request<DriveItem[]>(`/folders?ownerId=${ownerId}`);
}

export function createFolder(name: string, parentId: string | null, ownerId: string) {
  return request<DriveItem>('/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId, ownerId })
  });
}

export function uploadFile(file: File, parentId: string | null, ownerId: string, signal?: AbortSignal) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ownerId', ownerId);
  if (parentId) formData.append('parentId', parentId);
  return request<DriveItem>('/files/upload', { method: 'POST', body: formData, signal });
}

export function updateItem(id: string, payload: Partial<DriveItem>) {
  return request<DriveItem>(`/files/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function copyItem(id: string, parentId: string | null) {
  return request<DriveItem>(`/files/${id}/copy`, {
    method: 'POST',
    body: JSON.stringify({ parentId })
  });
}

export function saveTextFile(id: string, content: string) {
  return request<DriveItem>(`/files/${id}/text`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}

export function saveBinaryFile(id: string, contentBase64: string, mimeType?: string) {
  return request<DriveItem>(`/files/${id}/content`, {
    method: 'POST',
    body: JSON.stringify({ contentBase64, mimeType })
  });
}

export function deleteItem(id: string, hard = false) {
  return request<{ ok: true }>(`/files/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' });
}

export function shareItem(id: string) {
  return request<{ token: string; url: string }>(`/files/${id}/share`, { method: 'POST' });
}

export function shareItemAccess(
  id: string,
  users: SharePermission[],
  linkRole?: SharePermission['role'] | null
) {
  return request<DriveItem>(`/files/${id}/share/access`, {
    method: 'POST',
    body: JSON.stringify({ users, linkRole: linkRole ?? null })
  });
}

export function downloadUrl(itemId: string) {
  return fileAccessUrl(itemId, `/files/${itemId}/download`, 'download');
}

export function previewUrl(itemId: string) {
  return fileAccessUrl(itemId, `/files/${itemId}/preview`, 'preview');
}

export function getPdfInfo(itemId: string) {
  return request<{ pages: number; width: number | null; height: number | null }>(`/files/${itemId}/pdf-info`);
}

export function pdfPageUrl(itemId: string, page: number) {
  return fileAccessUrl(itemId, `/files/${itemId}/pages/${page}.png`, 'pdf-page');
}

export function getOfficeConfig(itemId: string, mode: 'view' | 'edit' = 'edit') {
  return request<OfficeEditorConfigResponse>(`/files/${itemId}/office/config?mode=${mode}`);
}
