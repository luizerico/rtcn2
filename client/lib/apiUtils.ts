/**
 * Client helpers for same-origin Next.js API routes (`/api/...`).
 * Browser sessions use the httpOnly cookie; credentials are always included.
 */

import { clearApiGetCache, getCachedGet } from '@/lib/apiGetCache';
import { clearGeoSessionCache } from '@/lib/geoSessionCache';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

class ApiError extends Error {
  code?: string;

  constructor(message: string, public status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

type AuthRedirectHandler = (payload: { code: string; message: string }) => void;

let authRedirectHandler: AuthRedirectHandler | null = null;

export function setAuthRedirectHandler(handler: AuthRedirectHandler | null) {
  authRedirectHandler = handler;
}

function buildAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

function resolveUrl(endpoint: string): string {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (BASE_URL.startsWith('http')) {
    return `${BASE_URL.replace(/\/$/, '')}${path}`;
  }
  return `${BASE_URL.replace(/\/$/, '')}${path}`;
}

async function parseError(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const errorData = (await res.json()) as {
      message?: string;
      code?: string;
      details?: {
        hint?: string;
        username?: string;
        [key: string]: unknown;
      };
      // Legacy top-level fields (pre-standardization).
      hint?: string;
      username?: string;
    };
    const details = errorData.details && typeof errorData.details === 'object' ? errorData.details : {};
    const username =
      typeof details.username === 'string'
        ? details.username
        : typeof errorData.username === 'string'
          ? errorData.username
          : undefined;
    const hint =
      typeof details.hint === 'string'
        ? details.hint
        : typeof errorData.hint === 'string'
          ? errorData.hint
          : undefined;

    const parts = [errorData.message || `API request failed with status ${res.status}`];
    if (username) {
      parts.push(`(user: ${username})`);
    }
    if (hint) {
      parts.push(hint);
    }
    return { message: parts.join(' '), code: errorData.code };
  } catch {
    return { message: `API request failed with status ${res.status}` };
  }
}

function clearLocalSessionHints() {
  clearApiGetCache();
  if (typeof window === 'undefined') return;
  localStorage.removeItem('authToken');
  localStorage.removeItem('userUsername');
  localStorage.removeItem('sessionId');
  try {
    sessionStorage.removeItem('rbac_access_cache_v1');
  } catch {
    // ignore
  }
}

function handleUnauthorized(message: string, code?: string) {
  if (typeof window === 'undefined') return;
  clearLocalSessionHints();
  const reason = code || 'EXPIRED';
  if (authRedirectHandler) {
    authRedirectHandler({ code: reason, message });
  } else if (!window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?reason=${encodeURIComponent(reason)}`;
  }
}

async function throwIfFailed(res: Response): Promise<void> {
  if (res.ok) return;
  const parsed = await parseError(res);
  if (
    res.status === 401 ||
    (res.status === 403 && (parsed.code === 'NOT_VERIFIED' || parsed.code === 'ACCOUNT_DISABLED'))
  ) {
    handleUnauthorized(parsed.message, parsed.code);
  }
  throw new ApiError(parsed.message, res.status, parsed.code);
}

async function request<T>(method: string, endpoint: string, bodyData?: object): Promise<T> {
  const res = await fetch(resolveUrl(endpoint), {
    method,
    headers: buildAuthHeaders(),
    credentials: 'include',
    body: bodyData ? JSON.stringify(bodyData) : undefined,
  });

  await throwIfFailed(res);
  return res.json() as Promise<T>;
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  return getCachedGet(endpoint, () => request<T>('GET', endpoint));
}

async function mutatingRequest<T>(method: string, endpoint: string, bodyData?: object): Promise<T> {
  const result = await request<T>(method, endpoint, bodyData);
  clearApiGetCache();
  return result;
}

export async function apiPost<T>(endpoint: string, bodyData: object = {}): Promise<T> {
  return mutatingRequest<T>('POST', endpoint, bodyData);
}

export async function apiPut<T>(endpoint: string, bodyData: object): Promise<T> {
  return mutatingRequest<T>('PUT', endpoint, bodyData);
}

export async function apiPatch<T>(endpoint: string, bodyData: object): Promise<T> {
  return mutatingRequest<T>('PATCH', endpoint, bodyData);
}

export async function apiDelete<T>(endpoint: string, bodyData?: object): Promise<T> {
  return mutatingRequest<T>('DELETE', endpoint, bodyData);
}

export async function apiUpload<T>(endpoint: string, formData: FormData): Promise<T> {
  const res = await fetch(resolveUrl(endpoint), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  await throwIfFailed(res);
  const result = (await res.json()) as T;
  clearApiGetCache();
  return result;
}

export async function apiDownload(endpoint: string, filename = 'download'): Promise<void> {
  const res = await fetch(resolveUrl(endpoint), {
    method: 'GET',
    credentials: 'include',
  });
  await throwIfFailed(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export { ApiError, clearLocalSessionHints, clearGeoSessionCache, clearApiGetCache };
