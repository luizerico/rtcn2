"use client";

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiGet } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import EditUserModal from '@/components/ui/EditUserModal';
import { useAccess } from '@/components/AccessProvider';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import { useToast } from '@/components/ToastProvider';

interface UserGroup {
  _id: string;
  name: string;
}

interface UserDetail {
  _id: string;
  username: string;
  email: string;
  isVerified?: boolean;
  isEnabled?: boolean;
  language?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  googleId?: string | null;
  groups?: UserGroup[];
  organization?: { _id: string; name: string } | null;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { pushToast } = useToast();
  const { can, ready } = useAccess();
  const canRead = can('USER:READ');
  const canWrite = can('USER:WRITE');

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const record = await apiGet<UserDetail>(`/users/${params.id}`);
      setUser(record);
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : 'Failed to load user.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (!ready) return;
    if (!canRead) {
      pushToast({
        tone: 'error',
        title: 'Access denied',
        message: 'You cannot view this user.',
      });
      router.replace('/admin/users');
      return;
    }
    void loadUser();
  }, [ready, canRead, loadUser, pushToast, router]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Users', href: '/admin/users' },
            { label: user?.username || 'User' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mt-2 text-3xl font-semibold">{user?.username || 'User'}</h1>
            <p className="mt-2 text-[var(--muted)]">Account details for this user.</p>
          </div>
          <AccessPrimaryButton allowed={canWrite && Boolean(user)} onClick={() => setEditOpen(true)}>
            Edit user
          </AccessPrimaryButton>
        </div>
      </header>

      {loading ? <p className="text-[var(--muted)]">Loading user…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {user && !loading ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">User information</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Field label="Username">{user.username}</Field>
            <Field label="Email">{user.email}</Field>
            <Field label="Organization">{user.organization?.name || '—'}</Field>
            <Field label="Language">{user.language || '—'}</Field>
            <Field label="Verified">
              {user.isVerified ? (
                <span className="text-emerald-700">Verified</span>
              ) : (
                <span className="text-[var(--muted)]">Not verified</span>
              )}
            </Field>
            <Field label="Enabled">
              {user.isEnabled === false ? (
                <span className="text-[var(--muted)]">Disabled</span>
              ) : (
                <span className="text-emerald-700">Enabled</span>
              )}
            </Field>
            <Field label="Groups">
              {user.groups?.length ? user.groups.map((group) => group.name).join(', ') : '—'}
            </Field>
            <Field label="Google sign-in">{user.googleId ? 'Linked' : 'Not linked'}</Field>
            <Field label="Last login">{formatDate(user.lastLoginAt)}</Field>
            <Field label="Created">{formatDate(user.createdAt)}</Field>
            <Field label="Updated">{formatDate(user.updatedAt)}</Field>
          </dl>
          <p className="mt-6 text-sm text-[var(--muted)]">
            <Link href="/admin/users" className="text-[var(--accent)] hover:underline">
              Back to users
            </Link>
          </p>
        </section>
      ) : null}

      <EditUserModal
        isOpen={editOpen}
        user={user}
        onClose={() => setEditOpen(false)}
        onSaved={({ username }) => {
          pushToast({
            tone: 'success',
            title: 'User updated',
            message: `${username} was saved.`,
          });
          void loadUser();
        }}
      />
    </div>
  );
}
