import type { UserAccount } from '$lib/types';

const TOKEN_KEY = 'drive_token';
const SESSIONS_KEY = 'drive_sessions';
const ACTIVE_SESSION_KEY = 'drive_active_session';

export interface StoredDriveSession {
  token: string;
  user: UserAccount;
  addedAt: string;
  lastUsedAt: string;
}

function canUseStorage() {
  return typeof localStorage !== 'undefined';
}

function sortStoredSessions(sessions: StoredDriveSession[]) {
  return [...sessions].sort((a, b) => {
    const aTime = Date.parse(a.addedAt || '');
    const bTime = Date.parse(b.addedAt || '');
    return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
  });
}

function readStoredSessions(): StoredDriveSession[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return sortStoredSessions(parsed.filter((session) => session?.token && session?.user?.id));
  } catch {
    return [];
  }
}

function writeStoredSessions(sessions: StoredDriveSession[]) {
  if (!canUseStorage()) return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sortStoredSessions(sessions)));
}

export function getToken(): string | null {
  if (!canUseStorage()) return null;
  const activeSession = getActiveStoredSession();
  return activeSession?.token ?? localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (!canUseStorage()) return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (!canUseStorage()) return;
  const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (activeSessionId) {
    removeStoredSession(activeSessionId);
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredSessions(): StoredDriveSession[] {
  return readStoredSessions();
}

export function getActiveStoredSession(): StoredDriveSession | null {
  if (!canUseStorage()) return null;
  const sessions = readStoredSessions();
  const activeId = localStorage.getItem(ACTIVE_SESSION_KEY);
  const session = sessions.find((item) => item.user.id === activeId) ?? sessions[0] ?? null;
  if (session) {
    localStorage.setItem(ACTIVE_SESSION_KEY, session.user.id);
    localStorage.setItem(TOKEN_KEY, session.token);
  }
  return session;
}

export function saveStoredSession(token: string, user: UserAccount): StoredDriveSession[] {
  if (!canUseStorage()) return [];
  const now = new Date().toISOString();
  const sessions = readStoredSessions();
  const existing = sessions.find((session) => session.user.id === user.id);
  const nextSession: StoredDriveSession = {
    token,
    user,
    addedAt: existing?.addedAt ?? now,
    lastUsedAt: now
  };
  const nextSessions = existing
    ? sessions.map((session) => (session.user.id === user.id ? nextSession : session))
    : [...sessions, nextSession];
  writeStoredSessions(nextSessions);
  localStorage.setItem(ACTIVE_SESSION_KEY, user.id);
  localStorage.setItem(TOKEN_KEY, token);
  return nextSessions;
}

export function updateStoredSessionUser(user: UserAccount): StoredDriveSession[] {
  if (!canUseStorage()) return [];
  const sessions = readStoredSessions();
  const nextSessions = sessions.map((session) =>
    session.user.id === user.id ? { ...session, user } : session
  );
  writeStoredSessions(nextSessions);
  return nextSessions;
}

export function setActiveStoredSession(userId: string): StoredDriveSession | null {
  if (!canUseStorage()) return null;
  const sessions = readStoredSessions();
  const session = sessions.find((item) => item.user.id === userId) ?? null;
  if (!session) return null;
  const now = new Date().toISOString();
  const nextSession = { ...session, lastUsedAt: now };
  const nextSessions = sessions.map((item) => (item.user.id === userId ? nextSession : item));
  writeStoredSessions(nextSessions);
  localStorage.setItem(ACTIVE_SESSION_KEY, userId);
  localStorage.setItem(TOKEN_KEY, session.token);
  return nextSession;
}

export function removeStoredSession(userId: string): StoredDriveSession[] {
  if (!canUseStorage()) return [];
  const sessions = readStoredSessions();
  const nextSessions = sessions.filter((session) => session.user.id !== userId);
  writeStoredSessions(nextSessions);

  const activeId = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (activeId === userId) {
    const nextActive = nextSessions[0] ?? null;
    if (nextActive) {
      localStorage.setItem(ACTIVE_SESSION_KEY, nextActive.user.id);
      localStorage.setItem(TOKEN_KEY, nextActive.token);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  }
  return nextSessions;
}

export function clearAllStoredSessions(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(SESSIONS_KEY);
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
}
