import type { ClientSessionMetadata, SecurityDeviceGroup, UserAccount } from '$lib/types';
import { request } from './core';

export function login(email: string, password: string, sessionMetadata?: ClientSessionMetadata) {
  return request<{ token: string; user: UserAccount }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, sessionMetadata }),
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function lookupLoginAccount(email: string) {
  return request<Pick<UserAccount, 'name' | 'email' | 'avatarColor' | 'avatarUrl'> | null>('/auth/lookup', {
    method: 'POST',
    body: JSON.stringify({ email }),
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function getSetupStatus() {
  return request<{ setupRequired: boolean }>('/auth/setup', {
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function setupFirstAccount(payload: {
  name: string;
  email: string;
  password: string;
  sessionMetadata?: ClientSessionMetadata;
}) {
  return request<{ token: string; user: UserAccount }>('/auth/setup', {
    method: 'POST',
    body: JSON.stringify(payload),
    auth: false,
    clearSessionOnUnauthorized: false
  });
}

export function logout() {
  return request<{ ok: true }>('/auth/logout', { method: 'POST' }).catch(() => null);
}

export function getMe() {
  return request<UserAccount>('/auth/me');
}

export function getSecuritySessions() {
  return request<SecurityDeviceGroup[]>('/auth/sessions');
}

export function revokeSecuritySession(id: string) {
  return request<{ ok: true }>(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function updateProfile(payload: {
  name?: string;
  email?: string;
  avatarColor?: string;
  avatarUrl?: string | null;
  currentPassword?: string;
  newPassword?: string;
}) {
  return request<UserAccount>('/profile', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteAccount(password: string) {
  return request<{ ok: true; setupRequired: boolean; deletedAccountId?: string }>('/profile', {
    method: 'DELETE',
    body: JSON.stringify({ password })
  });
}
