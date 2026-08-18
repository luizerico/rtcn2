"use client";

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/** Go to the previous history entry when it is same-origin; otherwise `fallbackHref`. */
export function useGoBack(fallbackHref: string) {
  const router = useRouter();

  return useCallback(() => {
    if (typeof window === 'undefined') {
      router.push(fallbackHref);
      return;
    }
    try {
      const referrer = document.referrer;
      if (referrer) {
        const from = new URL(referrer);
        if (from.origin === window.location.origin && from.href !== window.location.href) {
          router.back();
          return;
        }
      }
    } catch {
      // ignore invalid referrer
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [fallbackHref, router]);
}
