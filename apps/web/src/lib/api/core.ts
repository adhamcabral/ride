import { clearToken, getToken } from './session';
import { getApiUrl } from './server';

export { getApiUrl };

export class ApiConnectionError extends Error {
  constructor() {
    super('Servidor offline. Verifique sua rede ou tente trocar o servidor.');
    this.name = 'ApiConnectionError';
  }
}

export function isApiConnectionError(error: unknown): error is ApiConnectionError {
  return error instanceof ApiConnectionError;
}

export interface ApiRequestInit extends RequestInit {
  auth?: boolean;
  clearSessionOnUnauthorized?: boolean;
}

export async function request<T>(path: string, options?: ApiRequestInit): Promise<T> {
  const { auth = true, clearSessionOnUnauthorized = true, ...fetchOptions } = options ?? {};
  const token = auth ? getToken() : null;
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}${path}`, {
      cache: 'no-store',
      ...fetchOptions,
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        ...(fetchOptions.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchOptions.headers
      }
    });
  } catch (ex) {
    if (ex instanceof DOMException && ex.name === 'AbortError') throw ex;
    throw new ApiConnectionError();
  }

  if (response.status === 401) {
    const text = await response.text();
    let message = 'Sessão expirada.';
    try {
      const j = JSON.parse(text);
      message = j.message ?? message;
    } catch {}
    if (clearSessionOnUnauthorized) clearToken();
    throw new Error(message);
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j.message ?? text;
    } catch {}
    throw new Error(message || 'Erro inesperado na API.');
  }

  return response.json() as Promise<T>;
}
