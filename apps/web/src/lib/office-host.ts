const OFFICE_HOST_VERSION = 8;
const SERVER_URL_KEY = 'ride:server-url';
const DEFAULT_ONLYOFFICE_PORT = import.meta.env.VITE_ONLYOFFICE_PORT ?? '8082';
const NATIVE_ONLYOFFICE_PORT = import.meta.env.VITE_NATIVE_ONLYOFFICE_PORT ?? '8082';

function isNativeMobileApp() {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } })
    .Capacitor;
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform();
  return typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() !== 'web';
}

function configuredServerHost() {
  if (typeof localStorage === 'undefined') return '';
  try {
    const stored = localStorage.getItem(SERVER_URL_KEY);
    return stored ? new URL(stored).hostname : '';
  } catch {
    return '';
  }
}

export function normalizeOnlyOfficeDocumentServerUrl(documentServerUrl: string, currentHost?: string): string {
  try {
    const url = new URL(documentServerUrl);
    const host = currentHost ?? (typeof window !== 'undefined' ? window.location.hostname : '');
    const isDocumentServerLoopback = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
    const serverHost = configuredServerHost();
    const isServerLoopback = ['127.0.0.1', 'localhost', '::1'].includes(serverHost);
    if (isDocumentServerLoopback) {
      if (serverHost && !isServerLoopback) {
        url.hostname = serverHost;
      } else if (host) {
        url.hostname = host;
      }
    }
    if (isNativeMobileApp() && url.protocol === 'https:') {
      url.protocol = 'http:';
      url.port = NATIVE_ONLYOFFICE_PORT;
    }
    if (!url.port) url.port = DEFAULT_ONLYOFFICE_PORT;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return documentServerUrl.replace(/\/+$/, '');
  }
}

export function buildOnlyOfficeStandaloneUrl(documentServerUrl: string, config: unknown): string {
  const normalizedUrl = normalizeOnlyOfficeDocumentServerUrl(documentServerUrl);
  const sessionId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${normalizedUrl}/sdkjs-plugins/ride-office-host-v2.html?v=${OFFICE_HOST_VERSION}&session=${encodeURIComponent(
    sessionId
  )}#${encodeOfficeHostPayload({
    config
  })}`;
}

function encodeOfficeHostPayload(payload: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
