"use client";

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';

interface UserRecord {
  _id: string;
  username: string;
  email: string;
}

function PasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get('userId');
  const { pushToast } = useToast();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(targetUserId || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const me = await apiGet<{
          user: { id: string };
          permissions: Array<{ resourceType: string; permission: string }>;
        }>('/auth/me');

        const manage = me.permissions.some(
          (p) =>
            p.resourceType === 'USER' &&
            (p.permission === 'WRITE' || p.permission === 'ADMIN' || p.permission === 'CREATE')
        );
        setCanManageUsers(manage);

        if (manage) {
          const list = await apiGet<UserRecord[]>('/users');
          setUsers(list);
          if (targetUserId) {
            setSelectedUserId(targetUserId);
          }
        }
      } catch (err) {
        pushToast({
          tone: 'error',
          title: 'Unable to load account',
          message: err instanceof Error ? err.message : 'Please sign in again.',
        });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [targetUserId, pushToast]);

  const isAdminMode = Boolean(canManageUsers && selectedUserId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      pushToast({
        tone: 'warning',
        title: 'Passwords do not match',
        message: 'Confirm the new password and try again.',
      });
      return;
    }

    setSaving(true);
    try {
      if (isAdminMode) {
        await apiPost(`/users/${selectedUserId}/password`, { newPassword });
        pushToast({
          tone: 'success',
          title: 'Password updated',
          message: 'The user was disconnected from active sessions.',
        });
        setNewPassword('');
        setConfirmPassword('');
      } else {
        await apiPost('/auth/change-password', { currentPassword, newPassword });
        pushToast({
          tone: 'success',
          title: 'Password updated',
          message: 'Sign in again with your new password.',
        });
        localStorage.removeItem('authToken');
        localStorage.removeItem('userUsername');
        localStorage.removeItem('sessionId');
        router.replace('/login?reason=PASSWORD_CHANGED');
      }
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Update failed',
        message: err instanceof Error ? err.message : 'Could not update password.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">Account</p>
        <h1 className="mt-2 text-3xl font-semibold">Update password</h1>
        <p className="mt-2 text-[var(--muted)]">
          {canManageUsers
            ? 'Change your password, or reset a password for another user if you have USER:WRITE.'
            : 'Change the password for your own account.'}
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        {canManageUsers && (
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="target-user">
              Target user
            </label>
            <select
              id="target-user"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            >
              <option value="">Myself</option>
              {users.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.username} ({user.email})
                </option>
              ))}
            </select>
          </div>
        )}

        {!isAdminMode && (
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="current-password">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            />
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="confirm-password">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

export default function PasswordPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
      <PasswordForm />
    </Suspense>
  );
}
