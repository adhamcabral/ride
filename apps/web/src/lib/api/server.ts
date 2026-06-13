const SERVER_URL_KEY = 'ride:server-url';

const DEFAULT_API_URL = import.meta.env.VITE_API_URL ?? '/api';
const DEFAULT_WEB_PORT = import.meta.env.VITE_WEB_PORT ?? '3443';

function canUseStorage() {
  return typeof localStorage !== 'undefined';
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function currentOrigin() {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  return origin && !origin.startsWith('capacitor://') ? trimTrailingSlash(origin) : '';
}

export function isNativeMobileApp() {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } })
    .Capacitor;
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform();
  return typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() !== 'web';
}

export function normalizeDriveServerUrl(value: string) {
  const raw = value.trim();
  if (!raw) throw new Error('Informe o endereço do servidor.');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('Endereço de servidor inválido.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Use um endereço começando com http:// ou https://.');
  }
  const pathname = trimTrailingSlash(parsed.pathname);
  parsed.pathname = pathname.endsWith('/api') ? pathname : `${pathname}/api`;
  parsed.search = '';
  parsed.hash = '';
  return trimTrailingSlash(parsed.toString());
}

export function getConfiguredDriveServerUrl() {
  if (!canUseStorage()) return null;
  const stored = localStorage.getItem(SERVER_URL_KEY);
  return stored ? trimTrailingSlash(stored) : null;
}

function isLoopbackServerUrl(value: string) {
  if (!isAbsoluteHttpUrl(value)) return true;
  try {
    const hostname = new URL(value).hostname;
    return ['127.0.0.1', 'localhost', '::1'].includes(hostname);
  } catch {
    return true;
  }
}

export function hasConfiguredDriveServerUrl() {
  if (!isNativeMobileApp()) return false;
  if (getConfiguredDriveServerUrl()) return true;
  return !isLoopbackServerUrl(DEFAULT_API_URL);
}

export function getApiUrl() {
  if (isNativeMobileApp()) {
    const configured = getConfiguredDriveServerUrl();
    if (configured) return configured;
    return isAbsoluteHttpUrl(DEFAULT_API_URL) ? trimTrailingSlash(DEFAULT_API_URL) : '';
  }
  return trimTrailingSlash(DEFAULT_API_URL);
}

export function getDriveServerDisplayUrl() {
  const apiUrl = getApiUrl();
  const displayUrl = apiUrl.replace(/\/api$/, '');
  if (displayUrl.startsWith('/')) return `${currentOrigin()}${displayUrl === '/' ? '' : displayUrl}`;
  return displayUrl || currentOrigin();
}

export function getPublicAppUrl() {
  if (typeof window !== 'undefined' && !isNativeMobileApp()) {
    const origin = window.location.origin;
    if (origin && !origin.startsWith('capacitor://')) return trimTrailingSlash(origin);
  }

  const parsed = new URL(getDriveServerDisplayUrl());
  parsed.search = '';
  parsed.hash = '';
  if (parsed.port === '3333' && DEFAULT_WEB_PORT) parsed.port = DEFAULT_WEB_PORT;
  return trimTrailingSlash(parsed.toString());
}

export function buildShareUrl(token: string) {
  return `${getPublicAppUrl()}/share/${encodeURIComponent(token)}`;
}

export function setDriveServerUrl(value: string) {
  const normalized = normalizeDriveServerUrl(value);
  if (canUseStorage()) localStorage.setItem(SERVER_URL_KEY, normalized);
  return normalized;
}

export function clearDriveServerUrl() {
  if (canUseStorage()) localStorage.removeItem(SERVER_URL_KEY);
}
