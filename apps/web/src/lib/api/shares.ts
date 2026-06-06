import type { DriveItem, OfficeEditorConfigResponse } from '$lib/types';
import { getApiUrl, request } from './core';

export function sharedDownloadUrl(shareToken: string) {
  return `${getApiUrl()}/shares/${shareToken}/download`;
}

export function sharedItemDownloadUrl(shareToken: string, itemId: string) {
  return `${getApiUrl()}/shares/${shareToken}/items/${itemId}/download`;
}

export function sharedPreviewUrl(shareToken: string, itemId: string) {
  return `${getApiUrl()}/shares/${shareToken}/items/${itemId}/preview`;
}

export function getSharedPdfInfo(shareToken: string, itemId: string) {
  return request<{ pages: number; width: number | null; height: number | null }>(
    `/shares/${shareToken}/items/${itemId}/pdf-info`,
    { auth: false, clearSessionOnUnauthorized: false }
  );
}

export function sharedPdfPageUrl(shareToken: string, itemId: string, page: number) {
  return `${getApiUrl()}/shares/${shareToken}/items/${itemId}/pages/${page}.png`;
}

export function getSharedOfficeConfig(shareToken: string, itemId: string, mode: 'view' | 'edit' = 'view') {
  return request<OfficeEditorConfigResponse>(
    `/shares/${shareToken}/items/${itemId}/office/config?mode=${mode}`,
    { auth: false, clearSessionOnUnauthorized: false }
  );
}

export function saveSharedBinaryFile(
  shareToken: string,
  itemId: string,
  contentBase64: string,
  mimeType?: string
) {
  return request<DriveItem>(`/shares/${shareToken}/items/${itemId}/content`, {
    method: 'POST',
    body: JSON.stringify({ contentBase64, mimeType }),
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function createSharedFolder(shareToken: string, name: string, parentId: string | null) {
  return request<DriveItem>(`/shares/${shareToken}/folders`, {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function uploadSharedFile(
  shareToken: string,
  file: File,
  parentId: string | null,
  signal?: AbortSignal
) {
  const formData = new FormData();
  formData.append('file', file);
  if (parentId) formData.append('parentId', parentId);
  return request<DriveItem>(`/shares/${shareToken}/upload`, {
    method: 'POST',
    body: formData,
    signal,
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function updateSharedItem(shareToken: string, id: string, payload: Partial<DriveItem>) {
  return request<DriveItem>(`/shares/${shareToken}/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function deleteSharedItem(shareToken: string, id: string) {
  return request<{ ok: true }>(`/shares/${shareToken}/items/${id}`, {
    method: 'DELETE',
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function saveSharedTextFile(shareToken: string, id: string, content: string) {
  return request<DriveItem>(`/shares/${shareToken}/items/${id}/text`, {
    method: 'POST',
    body: JSON.stringify({ content }),
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function getShared(token: string) {
  return request<DriveItem>(`/shares/${token}`, { auth: false, clearSessionOnUnauthorized: false });
}

export function getSharedChildren(
  token: string,
  parentId?: string | null,
  options: { q?: string | null; deep?: boolean } = {}
) {
  const params = new URLSearchParams();
  if (parentId) params.set('parentId', parentId);
  if (options.q?.trim()) params.set('q', options.q.trim());
  if (options.deep) params.set('deep', 'true');
  const query = params.toString();
  return request<DriveItem[]>(`/shares/${token}/children${query ? `?${query}` : ''}`, {
    auth: false,
    clearSessionOnUnauthorized: false
  });
}
