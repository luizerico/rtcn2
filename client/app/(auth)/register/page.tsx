"use client";

import { useState } from 'react';
import Link from 'next/link';
import { apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';

export default function RegisterPage() {
  const { pushToast } = useToast();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await apiPost('/auth/register', {
        username,
        email,
        password,
      });

      pushToast({
        tone: 'success',
        title: 'Account created',
        message: 'Please sign in with your new credentials.',
      });
      window.location.href = '/login';
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      pushToast({
        tone: 'error',
        title: 'Registration failed',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
        <h2 className="mb-6 text-center text-3xl font-semibold">Create account</h2>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="username" className="mb-2 block text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
              required
              autoComplete="username"
            />
          </div>

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
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {isLoading ? 'Creating…' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
