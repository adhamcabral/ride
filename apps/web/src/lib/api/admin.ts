import type {
  AdminStats,
  DriveSettings,
  MaintenanceArtifact,
  MaintenanceOverview,
  ServerDirectoryListing,
  StorageAuditReport,
  UserAccount
} from '$lib/types';
import { request } from './core';

export function listAccounts() {
  return request<UserAccount[]>('/accounts');
}

export function createAccount(payload: {
  name: string;
  email: string;
  role: 'admin' | 'user';
  storageQuotaGb: number;
  password?: string;
}) {
  return request<UserAccount>('/accounts', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateAccount(
  id: string,
  payload: Partial<{ name: string; email: string; role: 'admin' | 'user'; storageQuotaGb: number }>
) {
  return request<UserAccount>(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteAdminAccount(id: string) {
  return request<{ ok: true; setupRequired: boolean; deletedAccountId?: string }>(`/accounts/${id}`, {
    method: 'DELETE'
  });
}

export function adminSetPassword(id: string, password: string) {
  return request<{ ok: true }>(`/accounts/${id}/set-password`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

export function getAdminStats() {
  return request<AdminStats>('/admin/stats');
}

export function getSettings() {
  return request<DriveSettings>('/admin/settings');
}

export function updateSettings(
  payload: Partial<{
    trashRetentionDays: number;
    backupScheduleEnabled: boolean;
    backupIntervalHours: number;
    backupRetentionCount: number;
    backupDirectory: string;
    backupTargetPaths: string[];
  }>
) {
  return request<DriveSettings>('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function getMaintenanceOverview() {
  return request<MaintenanceOverview>('/admin/maintenance');
}

export function browseServerDirectories(path?: string | null) {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  return request<ServerDirectoryListing>(`/admin/maintenance/directories${query}`);
}

export function backupDatabase() {
  return request<MaintenanceArtifact>('/admin/maintenance/backup', { method: 'POST' });
}

export function restoreDatabaseBackup(id: string) {
  return request<{ ok: true }>(`/admin/maintenance/backups/${encodeURIComponent(id)}/restore`, {
    method: 'POST'
  });
}

export function restoreUploadedBackup(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<{ ok: true }>('/admin/maintenance/backup/upload-restore', {
    method: 'POST',
    body: form
  });
}

export function deleteDatabaseBackup(id: string) {
  return request<{ ok: true }>(`/admin/maintenance/backups/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export function auditStorage(payload: { repair?: boolean; removeOrphans?: boolean } = {}) {
  return request<StorageAuditReport>('/admin/maintenance/audit', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
