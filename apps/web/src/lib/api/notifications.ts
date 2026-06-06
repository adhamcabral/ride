import type { DriveNotification } from '$lib/types';
import { request } from './core';

export function listNotifications() {
  return request<DriveNotification[]>('/notifications');
}

export function markNotificationsRead() {
  return request<{ ok: true }>('/notifications/read', { method: 'POST' });
}

export function clearNotifications() {
  return request<{ ok: true }>('/notifications', { method: 'DELETE' });
}
