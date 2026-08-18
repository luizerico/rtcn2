"use client";

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useToast } from '@/components/ToastProvider';
import { useTheme, type ThemeMode } from '@/components/ThemeProvider';
import { useAccess } from '@/components/AccessProvider';

interface UserGroup {
  _id: string;
  name: string;
}

interface ProfileUser {
  _id?: string;
  id?: string;
  username: string;
  email: string;
  isVerified?: boolean;
  lastLoginAt?: string | null;
  groups?: UserGroup[];
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get('userId');
  const { pushToast } = useToast();
  const { theme, setTheme } = useTheme();
  const { user: accessUser, isAdmin, can } = useAccess();

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canManageUsers = isAdmin && can('USER:READ');
  const viewingOther = Boolean(targetUserId && accessUser && targetUserId !== accessUser.id);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (viewingOther && targetUserId) {
          if (!canManageUsers) {
            pushToast({
              tone: 'error',
              title: 'Access denied',
              message: 'You cannot view another user’s profile.',
            });
            router.replace('/account');
            return;
          }
          const user = await apiGet<ProfileUser>(`/users/${targetUserId}`);
          if (!cancelled) setProfile(user);
        } else {
          const me = await apiGet<{
            user: {
              id: string;
              username: string;
              email: string;
              isVerified?: boolean;
              lastLoginAt?: string | null;
              groups?: UserGroup[];
            };
          }>('/auth/me');
          if (!cancelled) {
            setProfile({
              id: me.user.id,
              username: me.user.username,
              email: me.user.email,
              isVerified: me.user.isVerified,
              lastLoginAt: me.user.lastLoginAt,
              groups: me.user.groups,
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          pushToast({
            tone: 'error',
            title: 'Unable to load profile',
            message: err instanceof Error ? err.message : 'Please sign in again.',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [targetUserId, viewingOther, canManageUsers, pushToast, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (viewingOther) return;
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

  const crumbTrail = viewingOther
    ? [
        { label: 'Home', href: '/' },
        { label: 'Admin', href: '/admin' },
        { label: 'Users', href: '/admin/users' },
        { label: profile?.username || 'Profile' },
      ]
    : [{ label: 'Home', href: '/' }, { label: 'Profile' }];

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs items={crumbTrail} />
        <h1 className="mt-2 text-3xl font-semibold">
          {viewingOther ? `${profile?.username || 'User'} profile` : 'Your profile'}
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          {viewingOther
            ? 'Account details for this user.'
            : 'Review your account details, appearance, and password.'}
        </p>
      </header>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-[var(--muted)]">Username</dt>
            <dd className="mt-1 font-medium">{profile?.username || '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Email</dt>
            <dd className="mt-1 font-medium">{profile?.email || '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Verified</dt>
            <dd className="mt-1 font-medium">
              {profile?.isVerified ? (
                <span className="text-emerald-700">Verified</span>
              ) : (
                <span className="text-[var(--muted)]">Not verified</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Groups</dt>
            <dd className="mt-1 font-medium">
              {profile?.groups?.length
                ? profile.groups.map((g) => g.name).join(', ')
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Last login</dt>
            <dd className="mt-1 font-medium">{formatDate(profile?.lastLoginAt)}</dd>
          </div>
        </dl>
        {viewingOther ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            <Link href="/admin/users" className="text-[var(--accent)] hover:underline">
              Back to users
            </Link>
          </p>
        ) : null}
      </section>

      {!viewingOther ? (
        <>
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">Appearance</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Choose light or dark mode. Your preference is saved in a cookie on this device.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Color theme">
              {(
                [
                  { value: 'light', label: 'Light', hint: 'Bright surfaces' },
                  { value: 'dark', label: 'Dark', hint: 'Low-light friendly' },
                ] as const
              ).map((option) => {
                const selected = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTheme(option.value as ThemeMode)}
                    className={`rounded-lg border px-4 py-3 text-left transition ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] hover:border-[var(--accent)]'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div>
              <h2 className="text-lg font-semibold">Change password</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Update the password for your own account.
              </p>
            </div>

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
                autoComplete="current-password"
              />
            </div>

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
                autoComplete="new-password"
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
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
      <ProfileContent />
    </Suspense>
  );
}
