"use client";

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';

function VerifyContent() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const { pushToast } = useToast();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email…');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }

    let cancelled = false;
    apiGet<{ message: string }>(`/auth/verify-email/${encodeURIComponent(token)}`)
      .then((data) => {
        if (cancelled) return;
        setStatus('ok');
        setMessage(data.message || 'Email verified. You can sign in now.');
        pushToast({
          tone: 'success',
          title: 'Email verified',
          message: 'You can sign in with your account.',
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
      });

    return () => {
      cancelled = true;
    };
  }, [token, pushToast]);

  return (
    <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
      <h2 className="mb-4 text-center text-3xl font-semibold">Email verification</h2>
      <p
        className={`text-center text-sm ${
          status === 'error' ? 'text-red-700' : 'text-[var(--muted)]'
        }`}
        role={status === 'error' ? 'alert' : 'status'}
      >
        {message}
      </p>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
          Go to sign in
        </Link>
      </p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
        <VerifyContent />
      </Suspense>
    </div>
  );
}
