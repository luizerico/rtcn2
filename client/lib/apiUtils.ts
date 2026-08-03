/**
 * Client helpers for same-origin Next.js API routes (`/api/...`).
 */

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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
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

function handleUnauthorized(message: string, code?: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('authToken');
  localStorage.removeItem('userUsername');
  localStorage.removeItem('sessionId');
  try {
    sessionStorage.removeItem('rbac_access_cache_v1');
  } catch {
    // ignore
  }
  const reason = code || 'EXPIRED';
  if (authRedirectHandler) {
    authRedirectHandler({ code: reason, message });
  } else if (!window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?reason=${encodeURIComponent(reason)}`;
  }
}

async function request<T>(method: string, endpoint: string, bodyData?: object): Promise<T> {
  const res = await fetch(resolveUrl(endpoint), {
    method,
    headers: buildAuthHeaders(),
    body: bodyData ? JSON.stringify(bodyData) : undefined,
  });

  if (!res.ok) {
    const parsed = await parseError(res);
    if (res.status === 401) {
      handleUnauthorized(parsed.message, parsed.code);
    }
    throw new ApiError(parsed.message, res.status, parsed.code);
  }

  return res.json() as Promise<T>;
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  return request<T>('GET', endpoint);
}

export async function apiPost<T>(endpoint: string, bodyData: object = {}): Promise<T> {
  return request<T>('POST', endpoint, bodyData);
}

export async function apiPut<T>(endpoint: string, bodyData: object): Promise<T> {
  return request<T>('PUT', endpoint, bodyData);
}

export async function apiDelete<T>(endpoint: string, bodyData?: object): Promise<T> {
  return request<T>('DELETE', endpoint, bodyData);
}

export { ApiError };
