"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiGet, ApiError } from '@/lib/apiUtils';
import {
  canAccess,
  type AccessGrant,
  type AccessSnapshot,
  type AccessUser,
  type CanOptions,
} from '@/lib/access';
import { clearAccessCache, readAccessCache, writeAccessCache } from '@/lib/accessCache';

interface MeResponse {
  user: AccessUser;
  permissions: AccessGrant[];
  isAdmin?: boolean;
  session?: { sessionId?: string } | null;
}

interface AccessContextValue {
  ready: boolean;
  loading: boolean;
  snapshot: AccessSnapshot | null;
  user: AccessUser | null;
  isAdmin: boolean;
  can: (permission: string, options?: CanOptions) => boolean;
  /** Force refresh from API and update cache. */
  refresh: () => Promise<AccessSnapshot | null>;
  /** Drop cache (call on logout). */
  clear: () => void;
  /** Ensure access is loaded (uses cache when fresh). */
  ensure: (options?: { force?: boolean }) => Promise<AccessSnapshot | null>;
}

const AccessContext = createContext<AccessContextValue | null>(null);

function toSnapshot(data: MeResponse): AccessSnapshot {
  return {
    user: data.user,
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
    isAdmin: Boolean(data.isAdmin),
    fetchedAt: Date.now(),
    sessionId:
      data.session?.sessionId ||
      (typeof window !== 'undefined' ? localStorage.getItem('sessionId') : null),
  };
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AccessSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const snapshotRef = useRef<AccessSnapshot | null>(null);
  const inFlightRef = useRef<Promise<AccessSnapshot | null> | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const clear = useCallback(() => {
    clearAccessCache();
    snapshotRef.current = null;
    setSnapshot(null);
  }, []);

  const applySnapshot = useCallback((next: AccessSnapshot) => {
    writeAccessCache(next);
    snapshotRef.current = next;
    setSnapshot(next);
    return next;
  }, []);

  const fetchMe = useCallback(async (): Promise<AccessSnapshot | null> => {
    setLoading(true);
    try {
      const data = await apiGet<MeResponse>('/auth/me');
      return applySnapshot(toSnapshot(data));
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  const ensure = useCallback(
    async (options?: { force?: boolean }): Promise<AccessSnapshot | null> => {
      if (!options?.force) {
        const cached = readAccessCache();
        if (cached) {
          snapshotRef.current = cached;
          setSnapshot(cached);
          setReady(true);
          return cached;
        }
        const current = snapshotRef.current;
        if (current && Date.now() - current.fetchedAt < 30_000) {
          setReady(true);
          return current;
        }
      }

      if (inFlightRef.current && !options?.force) {
        return inFlightRef.current;
      }

      const request = (async () => {
        try {
          const next = await fetchMe();
          if (next?.sessionId && typeof window !== 'undefined') {
            localStorage.setItem('sessionId', next.sessionId);
            if (next.user?.username) {
              localStorage.setItem('userUsername', next.user.username);
            }
          }
          setReady(true);
          return next;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            clear();
          }
          setReady(true);
          throw err;
        } finally {
          inFlightRef.current = null;
        }
      })();

      inFlightRef.current = request;
      return request;
    },
    [clear, fetchMe]
  );

  const refresh = useCallback(async () => ensure({ force: true }), [ensure]);

  useEffect(() => {
    const cached = readAccessCache();
    if (cached) {
      snapshotRef.current = cached;
      setSnapshot(cached);
      setReady(true);
    }
  }, []);

  const value = useMemo<AccessContextValue>(
    () => ({
      ready,
      loading,
      snapshot,
      user: snapshot?.user || null,
      isAdmin: Boolean(snapshot?.isAdmin),
      can: (permission, options) => canAccess(snapshot, permission, options),
      refresh,
      clear,
      ensure,
    }),
    [ready, loading, snapshot, refresh, clear, ensure]
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessContextValue {
  const ctx = useContext(AccessContext);
  if (!ctx) {
    throw new Error('useAccess must be used within AccessProvider');
  }
  return ctx;
}

/** Safe for components that may render outside provider in tests. */
export function useAccessOptional(): AccessContextValue | null {
  return useContext(AccessContext);
}
