"use client";

import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPut } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import CreateUserModal from '@/components/ui/CreateUserModal';
import { useAccess } from '@/components/AccessProvider';
import { AccessLink, AccessPrimaryButton, AccessTextButton } from '@/components/ui/AccessControls';

interface UserRecord {
  _id: string;
  username: string;
  email: string;
  isVerified?: boolean;
  createdAt?: string;
}

export default function AdminUsersPage() {
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canCreate = can('USER:CREATE');
  const canWrite = can('USER:WRITE');
  const canDelete = can('USER:DELETE');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

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

  const handleToggleVerified = async (user: UserRecord) => {
    setError(null);
    setVerifyingId(user._id);
    const next = !user.isVerified;
    try {
      await apiPut(`/users/${user._id}`, { isVerified: next });
      pushToast({
        tone: 'success',
        title: next ? 'User verified' : 'Verification revoked',
        message: next
          ? `${user.username} can sign in.`
          : `${user.username} can no longer sign in until verified again.`,
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update verification.');
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Users' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mt-2 text-3xl font-semibold">User management</h1>
            <p className="mt-2 text-[var(--muted)]">
              Create accounts and verify users before they can sign in.
            </p>
          </div>
          <AccessPrimaryButton allowed={canCreate} onClick={() => setCreateOpen(true)}>
            Create user
          </AccessPrimaryButton>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

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
                  <td className="px-4 py-3">
                    <span className={user.isVerified ? 'text-emerald-700' : 'text-[var(--muted)]'}>
                      {user.isVerified ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <AccessTextButton
                      allowed={canWrite}
                      onClick={() => handleToggleVerified(user)}
                      disabled={verifyingId === user._id}
                    >
                      {verifyingId === user._id
                        ? 'Updating…'
                        : user.isVerified
                          ? 'Revoke verify'
                          : 'Verify'}
                    </AccessTextButton>
                    <AccessLink allowed={canWrite} href={`/account?userId=${user._id}`}>
                      Password
                    </AccessLink>
                    <AccessTextButton
                      allowed={canDelete}
                      danger
                      onClick={() => handleDelete(user._id)}
                    >
                      Delete
                    </AccessTextButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <CreateUserModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={({ username }) => {
          pushToast({
            tone: 'success',
            title: 'User created',
            message: `${username} was added and verified for sign-in.`,
          });
          void loadUsers();
        }}
      />
    </div>
  );
}
