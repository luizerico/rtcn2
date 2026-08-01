"use client";

import { useEffect, useState } from 'react';
import { apiDelete, apiGet } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

interface SessionRecord {
  _id: string;
  sessionId: string;
  userId: string;
  username: string;
  userAgent?: string;
  ipAddress?: string;
  clientApp?: string;
  createdAt?: string;
  expiresAt: string;
  lastSeenAt?: string;
}

export default function AdminSessionsPage() {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [scope, setScope] = useState<'all' | 'self'>('self');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ sessions: SessionRecord[]; scope: 'all' | 'self' }>('/auth/sessions');
      setSessions(data.sessions);
      setScope(data.scope);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const disconnect = async (sessionId: string) => {
    try {
      await apiDelete(`/auth/sessions/${sessionId}`);
      pushToast({
        tone: 'success',
        title: 'Session disconnected',
        message: 'The user will need to sign in again.',
      });
      await loadSessions();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Disconnect failed',
        message: err instanceof Error ? err.message : 'Could not disconnect session.',
      });
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Sessions' },
          ]}
        />
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
          Admin / Sessions
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Active sessions</h1>
        <p className="mt-2 text-[var(--muted)]">
          Sessions are stored in MongoDB so other apps can share authentication. Scope:{' '}
          <strong>{scope === 'all' ? 'all users' : 'your sessions only'}</strong>.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No active sessions.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">App</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.sessionId} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{session.username}</div>
                    <div className="max-w-xs truncate text-xs text-[var(--muted)]">
                      {session.userAgent || 'Unknown agent'}
                    </div>
                  </td>
                  <td className="px-4 py-3">{session.clientApp || 'rbac-platform'}</td>
                  <td className="px-4 py-3">{session.ipAddress || '—'}</td>
                  <td className="px-4 py-3">
                    {session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">{new Date(session.expiresAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => disconnect(session.sessionId)}
                      className="text-[var(--danger)] hover:underline"
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
