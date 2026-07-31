"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function RedirectToProfile() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const userId = searchParams.get('userId');
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    router.replace(`/account${query}`);
  }, [router, searchParams]);

  return <p className="text-[var(--muted)]">Redirecting to profile…</p>;
}

export default function PasswordRedirectPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
      <RedirectToProfile />
    </Suspense>
  );
}
