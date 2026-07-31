/**
 * Client helpers for same-origin Next.js API routes (`/api/...`).
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
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

async function parseError(res: Response): Promise<string> {
  try {
    const errorData = (await res.json()) as { message?: string; hint?: string; username?: string };
    const parts = [errorData.message || `API request failed with status ${res.status}`];
    if (errorData.username) {
      parts.push(`(user: ${errorData.username})`);
    }
    if (errorData.hint) {
      parts.push(errorData.hint);
    }
    return parts.join(' ');
  } catch {
    return `API request failed with status ${res.status}`;
  }
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  const res = await fetch(resolveUrl(endpoint), {
    method: 'GET',
    headers: buildAuthHeaders(),
  });

  if (res.status === 401 || res.status === 403) {
    throw new ApiError(await parseError(res), res.status);
  }
  if (!res.ok) {
    throw new ApiError(await parseError(res), res.status);
  }

  return res.json() as Promise<T>;
}

export async function apiPost<T>(endpoint: string, bodyData: object): Promise<T> {
  const res = await fetch(resolveUrl(endpoint), {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(bodyData),
  });

  if (res.status === 401 || res.status === 403) {
    throw new ApiError(await parseError(res), res.status);
  }
  if (!res.ok) {
    throw new ApiError(await parseError(res), res.status);
  }

  return res.json() as Promise<T>;
}

export async function apiPut<T>(endpoint: string, bodyData: object): Promise<T> {
  const res = await fetch(resolveUrl(endpoint), {
    method: 'PUT',
    headers: buildAuthHeaders(),
    body: JSON.stringify(bodyData),
  });

  if (res.status === 401 || res.status === 403) {
    throw new ApiError(await parseError(res), res.status);
  }
  if (!res.ok) {
    throw new ApiError(await parseError(res), res.status);
  }

  return res.json() as Promise<T>;
}

export async function apiDelete<T>(endpoint: string, bodyData?: object): Promise<T> {
  const res = await fetch(resolveUrl(endpoint), {
    method: 'DELETE',
    headers: buildAuthHeaders(),
    body: bodyData ? JSON.stringify(bodyData) : undefined,
  });

  if (res.status === 401 || res.status === 403) {
    throw new ApiError(await parseError(res), res.status);
  }
  if (!res.ok) {
    throw new ApiError(await parseError(res), res.status);
  }

  return res.json() as Promise<T>;
}

export { ApiError };
