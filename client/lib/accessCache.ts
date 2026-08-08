import type { AccessSnapshot } from '@/lib/access';

const CACHE_KEY = 'rbac_access_cache_v1';
/** Reuse cached /auth/me access for this long before refetching. */
export const ACCESS_CACHE_TTL_MS = 5 * 60 * 1000;

function sessionFingerprint(sessionId?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  const id = sessionId || localStorage.getItem('sessionId');
  if (!id) return null;
  return `sid:${id}`;
}

interface StoredCache {
  fingerprint: string;
  snapshot: AccessSnapshot;
}

export function clearAccessCache() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export function readAccessCache(): AccessSnapshot | null {
  if (typeof window === 'undefined') return null;
  const fingerprint = sessionFingerprint();
  if (!fingerprint) {
    clearAccessCache();
    return null;
  }

  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCache;
    if (!parsed?.snapshot || parsed.fingerprint !== fingerprint) {
      clearAccessCache();
      return null;
    }
    if (Date.now() - parsed.snapshot.fetchedAt > ACCESS_CACHE_TTL_MS) {
      return null;
    }
    return parsed.snapshot;
  } catch {
    clearAccessCache();
    return null;
  }
}

export function writeAccessCache(snapshot: AccessSnapshot) {
  if (typeof window === 'undefined') return;
  const fingerprint = sessionFingerprint(snapshot.sessionId);
  if (!fingerprint) return;
  try {
    const payload: StoredCache = { fingerprint, snapshot };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}
