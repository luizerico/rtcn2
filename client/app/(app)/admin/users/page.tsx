"use client";

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet, apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';

interface UserRecord {
  _id: string;
  username: string;
  email: string;
  isVerified?: boolean;
  createdAt?: string;
}

export default function AdminUsersPage() {
  const { pushToast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<UserRecord[]>('/users');
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost('/users', { username, email, password });
      setUsername('');
      setEmail('');
      setPassword('');
      pushToast({ tone: 'success', title: 'User created', message: `${username} was added.` });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await apiDelete(`/users/${id}`);
      pushToast({ tone: 'info', title: 'User deleted', message: 'The account was removed.' });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">Admin / Users</p>
        <h1 className="mt-2 text-3xl font-semibold">User management</h1>
        <p className="mt-2 text-[var(--muted)]">Create accounts and review registered users.</p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-4">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          required
          className="rounded-md border border-[var(--border)] px-3 py-2"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          className="rounded-md border border-[var(--border)] px-3 py-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="rounded-md border border-[var(--border)] px-3 py-2"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
        >
          {saving ? 'Creating…' : 'Add user'}
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No users found.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Verified</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-medium">{user.username}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.isVerified ? 'Yes' : 'No'}</td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <Link
                      href={`/account?userId=${user._id}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Password
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(user._id)}
                      className="text-[var(--danger)] hover:underline"
                    >
                      Delete
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
