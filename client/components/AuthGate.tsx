"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiGet, ApiError, setAuthRedirectHandler } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';

const PUBLIC_PATHS = ['/login', '/register'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { pushToast } = useToast();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthRedirectHandler(({ code, message }) => {
      pushToast({
        tone: 'error',
        title: 'Session ended',
        message,
      });
      router.replace(`/login?reason=${encodeURIComponent(code)}`);
    });

    return () => setAuthRedirectHandler(null);
  }, [router, pushToast]);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (isPublicPath(pathname)) {
        setReady(true);
        return;
      }

      const token = localStorage.getItem('authToken');
      if (!token) {
        pushToast({
          tone: 'warning',
          title: 'Sign in required',
          message: 'You need an active session to open this page.',
        });
        router.replace('/login?reason=NO_TOKEN');
        return;
      }

      try {
        await apiGet('/auth/me');
        if (!cancelled) setReady(true);
      } catch (err) {
        // 401 already clears storage and redirects via setAuthRedirectHandler.
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
        const code = err instanceof ApiError && err.code ? err.code : 'INVALID';
        if (!cancelled) {
          pushToast({
            tone: 'error',
            title: 'Session ended',
            message: err instanceof Error ? err.message : 'Please sign in again.',
          });
          router.replace(`/login?reason=${encodeURIComponent(code)}`);
        }
      }
    }

    setReady(false);
    verify();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, pushToast]);

  if (!ready && !isPublicPath(pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
        Checking session…
      </div>
    );
  }

  return <>{children}</>;
}
