"use client";

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import { clearAccessCache } from '@/lib/accessCache';
import { collapseNavForLogin } from '@/lib/uiPreferences';
import GoogleAuthButton from '@/components/ui/GoogleAuthButton';

const REASON_COPY: Record<string, { title: string; message: string }> = {
  NO_TOKEN: {
    title: 'Sign in required',
    message: 'No active session was found. Please sign in to continue.',
  },
  EXPIRED: {
    title: 'Session expired',
    message: 'Your session timed out. Sign in again to continue.',
  },
  REVOKED: {
    title: 'Session disconnected',
    message: 'This session was ended (logout, password change, or admin disconnect).',
  },
  INVALID: {
    title: 'Invalid session',
    message: 'Your session token is invalid. Please sign in again.',
  },
  USER_NOT_FOUND: {
    title: 'Account unavailable',
    message: 'The account for this session no longer exists.',
  },
  PASSWORD_CHANGED: {
    title: 'Password updated',
    message: 'Sign in with your new password.',
  },
  FORBIDDEN: {
    title: 'Access denied',
    message: 'You are signed in but lack permission for that page. Use an authorized account.',
  },
  NOT_VERIFIED: {
    title: 'Account not verified',
    message:
      'Check your email for a verification link, or ask an administrator to verify your account.',
  },
  GOOGLE_NOT_CONFIGURED: {
    title: 'Google sign-in unavailable',
    message: 'Google OAuth is not configured on this server.',
  },
  GOOGLE_DENIED: {
    title: 'Google sign-in cancelled',
    message: 'Google did not authorize the sign-in request.',
  },
  GOOGLE_STATE: {
    title: 'Google sign-in failed',
    message: 'The sign-in request could not be validated. Try again.',
  },
  GOOGLE_FAILED: {
    title: 'Google sign-in failed',
    message: 'Could not complete Google authentication. Try again or use a password.',
  },
};

function LoginForm() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason') || '';
  const { pushToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonInfo = useMemo(() => REASON_COPY[reason] || null, [reason]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiPost<{
        sessionId: string;
        user: { username: string; email: string };
      }>('/auth/login', {
        email,
        password,
      });

      // Session JWT is delivered via httpOnly cookie; keep only non-secret hints locally.
      localStorage.removeItem('authToken');
      localStorage.setItem('sessionId', response.sessionId);
      localStorage.setItem('userUsername', response.user.username);
      clearAccessCache();
      collapseNavForLogin();

      pushToast({
        tone: 'success',
        title: 'Signed in',
        message: `Welcome back, ${response.user.username}.`,
      });

      window.location.href = '/';
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      pushToast({
        tone: 'error',
        title: 'Sign in failed',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
      <h2 className="mb-2 text-center text-3xl font-semibold text-[var(--foreground)]">Sign in</h2>
      <p className="mb-6 text-center text-sm text-[var(--muted)]">
        Sign in with your registered email. Admin features require the seeded account from{' '}
        <code className="rounded bg-[var(--accent-soft)] px-1">npm run db:init</code>.
      </p>

      {reasonInfo && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900" role="status">
          <p className="font-semibold">{reasonInfo.title}</p>
          <p className="text-sm">{reasonInfo.message}</p>
        </div>
      )}

      {error && (
        <div className="relative mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-[var(--muted)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        or
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <GoogleAuthButton label="Sign in with Google" />

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        No account?{' '}
        <Link href="/register" className="font-medium text-[var(--accent)] hover:underline">
          Register
        </Link>
        . Registered users start with no admin permissions.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
