"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet, apiPut } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import CreateUserModal from '@/components/ui/CreateUserModal';
import ChangePasswordModal from '@/components/ui/ChangePasswordModal';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import { AccessIconButton, TableActionRow, tableActionRowGroupClass } from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { buildListParams, type PaginatedList } from '@/lib/listTypes';

interface UserGroup {
  _id: string;
  name: string;
}

interface UserRecord {
  _id: string;
  username: string;
  email: string;
  isVerified?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  groups?: UserGroup[];
}

interface GroupOption {
  _id: string;
  name: string;
}

type SortField = 'username' | 'email' | 'createdAt' | 'lastLoginAt' | 'isVerified';

const USER_COLUMNS: ColumnDef[] = [
  { id: 'username', label: 'Username', alwaysVisible: true },
  { id: 'email', label: 'Email' },
  { id: 'groups', label: 'Groups' },
  { id: 'verified', label: 'Verified' },
  { id: 'lastLogin', label: 'Last login' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

const DEFAULT_FILTERS = {
  q: '',
  username: '',
  email: '',
  isVerified: '',
  groupId: '',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function AdminUsersPage() {
  const { pushToast } = useToast();
  const { can, isAdmin } = useAccess();
  const canCreate = can('USER:CREATE');
  const canWrite = can('USER:WRITE');
  const canDelete = can('USER:DELETE');

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortField>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);

  const [data, setData] = useState<PaginatedList<UserRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserRecord | null>(null);

  const columns = useMemo(() => USER_COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('admin-users', columns, {
    enabled: isAdmin,
  });

  const hasActiveFilters = Object.values(applied).some(Boolean);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildListParams({ page, limit, sort, order, filters: applied });
      const result = await apiGet<PaginatedList<UserRecord>>(`/users?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [applied, limit, order, page, sort]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    apiGet<PaginatedList<GroupOption>>('/groups?limit=100&sort=name&order=asc')
      .then((result) => setGroupOptions(result.items || []))
      .catch(() => setGroupOptions([]));
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const onReset = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setSort('createdAt');
    setOrder('desc');
    setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder(field === 'createdAt' || field === 'lastLoginAt' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const sortIndicator = (field: SortField) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await apiDelete(`/users/${pendingDelete._id}`);
      pushToast({ tone: 'info', title: 'User deleted', message: 'The account was removed.' });
      setPendingDelete(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user.');
    } finally {
      setDeleting(false);
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

  const pagination = data?.pagination;
  const users = data?.items || [];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
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
              Search, filter, and manage accounts. Filtering runs on the API.
            </p>
          </div>
          <AccessPrimaryButton allowed={canCreate} onClick={() => setCreateOpen(true)}>
            Create user
          </AccessPrimaryButton>
        </div>
      </header>

      {showFilters ? (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Search</span>
            <input
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Username or email…"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Username</span>
            <input
              value={filters.username}
              onChange={(e) => setFilters((prev) => ({ ...prev, username: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Email</span>
            <input
              value={filters.email}
              onChange={(e) => setFilters((prev) => ({ ...prev, email: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Verified</span>
            <select
              value={filters.isVerified}
              onChange={(e) => setFilters((prev) => ({ ...prev, isVerified: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="true">Verified</option>
              <option value="false">Not verified</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Group</span>
            <select
              value={filters.groupId}
              onChange={(e) => setFilters((prev) => ({ ...prev, groupId: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {groupOptions.map((group) => (
                <option key={group._id} value={group._id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 md:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]/40"
            >
              Reset
            </button>
          </div>
        </form>
      ) : null}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>
            {pagination
              ? pagination.total === 0
                ? '0 users'
                : `${pagination.total} user${pagination.total === 1 ? '' : 's'} · page ${pagination.page} of ${pagination.totalPages}`
              : '—'}
            {hasActiveFilters ? ' · filters active' : ''}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span>Page size</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[var(--foreground)]"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span>
              Sorted by {sort} ({order})
            </span>
            <TableOptionsMenu
              columns={isAdmin ? columns : []}
              isVisible={isAdmin ? isVisible : undefined}
              toggle={isAdmin ? toggle : undefined}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters((prev) => !prev)}
            />
          </div>
        </div>

        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No users match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  {isVisible('username') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('username')} className="hover:text-[var(--accent)]">
                        Username{sortIndicator('username')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('email') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('email')} className="hover:text-[var(--accent)]">
                        Email{sortIndicator('email')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('groups') ? <th className="px-4 py-3 font-medium">Groups</th> : null}
                  {isVisible('verified') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('isVerified')} className="hover:text-[var(--accent)]">
                        Verified{sortIndicator('isVerified')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('lastLogin') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('lastLoginAt')} className="hover:text-[var(--accent)]">
                        Last login{sortIndicator('lastLoginAt')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('actions') ? (
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user._id}
                    className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                  >
                    {isVisible('username') ? (
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/account?userId=${user._id}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {user.username}
                        </Link>
                      </td>
                    ) : null}
                    {isVisible('email') ? <td className="px-4 py-3">{user.email}</td> : null}
                    {isVisible('groups') ? (
                      <td className="px-4 py-3">
                        {user.groups?.length ? user.groups.map((g) => g.name).join(', ') : '—'}
                      </td>
                    ) : null}
                    {isVisible('verified') ? (
                      <td className="px-4 py-3">
                        {user.isVerified ? (
                          <span className="text-emerald-700">Verified</span>
                        ) : (
                          <span className="font-medium text-[var(--muted)]">Not verified</span>
                        )}
                      </td>
                    ) : null}
                    {isVisible('lastLogin') ? (
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(user.lastLoginAt)}</td>
                    ) : null}
                    {isVisible('actions') ? (
                      <td className="px-4 py-3 text-right">
                        <TableActionRow>
                          <AccessIconButton
                            allowed={canWrite}
                            icon={user.isVerified ? 'verify' : 'unverify'}
                            label={
                              verifyingId === user._id
                                ? 'Updating…'
                                : user.isVerified
                                  ? 'Unverify'
                                  : 'Verify'
                            }
                            onClick={() => handleToggleVerified(user)}
                            disabled={verifyingId === user._id}
                          />
                          <AccessIconButton
                            allowed={canWrite}
                            icon="password"
                            label="Change password"
                            onClick={() => setPasswordUser(user)}
                          />
                          <AccessIconButton
                            allowed={canDelete}
                            icon="delete"
                            label="Delete"
                            danger
                            onClick={() => setPendingDelete(user)}
                          />
                        </TableActionRow>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[var(--muted)]">
            {pagination
              ? pagination.total === 0
                ? '0 users'
                : `Showing page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)`
              : '—'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!pagination?.hasPrev || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!pagination?.hasNext || loading}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
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

      <ChangePasswordModal
        isOpen={Boolean(passwordUser)}
        onClose={() => setPasswordUser(null)}
        userId={passwordUser?._id || ''}
        username={passwordUser?.username || ''}
        onUpdated={() => {
          pushToast({
            tone: 'success',
            title: 'Password updated',
            message: 'The user was disconnected from active sessions.',
          });
        }}
      />

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        itemLabel={pendingDelete?.username}
        busy={deleting}
      />
    </div>
  );
}
