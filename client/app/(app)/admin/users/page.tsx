"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet, apiPut } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import CreateUserModal from '@/components/ui/CreateUserModal';
import EditUserModal from '@/components/ui/EditUserModal';
import ChangePasswordModal from '@/components/ui/ChangePasswordModal';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import PermissionModal from '@/components/ui/PermissionModal';
import { useAccess } from '@/components/AccessProvider';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import { AccessIconButton, TableActionRow, tableActionRowGroupClass } from '@/components/ui/TableActionIcon';
import RowActionsMenu from '@/components/ui/RowActionsMenu';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { buildListParams, type PaginatedList } from '@/lib/listTypes';
import { useAutoAppliedFilters } from '@/lib/useDebouncedValue';

interface UserGroup {
  _id: string;
  name: string;
}

interface UserRecord {
  _id: string;
  username: string;
  email: string;
  isVerified?: boolean;
  isEnabled?: boolean;
  language?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  groups?: UserGroup[];
  organization?: { _id: string; name: string } | null;
}

interface GroupOption {
  _id: string;
  name: string;
}

type SortField = 'username' | 'email' | 'createdAt' | 'lastLoginAt' | 'isVerified' | 'isEnabled';

const USER_COLUMNS: ColumnDef[] = [
  { id: 'username', label: 'Username', alwaysVisible: true },
  { id: 'email', label: 'Email' },
  { id: 'organization', label: 'Organization' },
  { id: 'groups', label: 'Groups' },
  { id: 'verified', label: 'Verified' },
  { id: 'enabled', label: 'Enabled' },
  { id: 'lastLogin', label: 'Last login' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

const DEFAULT_FILTERS = {
  q: '',
  username: '',
  email: '',
  isVerified: '',
  isEnabled: '',
  groupId: '',
  organizationId: '',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function bulkButtonClass(danger = false) {
  const color = danger
    ? 'text-[var(--danger)] hover:bg-red-50'
    : 'text-[var(--foreground)] hover:bg-[var(--accent-soft)]/40';
  return `rounded-md border border-[var(--border)] px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${color}`;
}

export default function AdminUsersPage() {
  const { pushToast } = useToast();
  const { can, isAdmin, user: currentUser } = useAccess();
  const canCreate = can('USER:CREATE');
  const canWrite = can('USER:WRITE');
  const canDelete = can('USER:DELETE');
  const canManageAcl = can('GROUP:WRITE');
  const canSelect = canWrite || canDelete;
  const [aclUser, setAclUser] = useState<UserRecord | null>(null);

  const { filters, setFilters, applied, page, setPage, resetFilters } = useAutoAppliedFilters(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortField>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [orgOptions, setOrgOptions] = useState<GroupOption[]>([]);

  const [data, setData] = useState<PaginatedList<UserRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionBusy, setActionBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UserRecord[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [passwordUser, setPasswordUser] = useState<UserRecord | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const columns = useMemo(() => USER_COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('admin-users', columns, {
    enabled: isAdmin,
  });

  const hasActiveFilters = Object.values(applied).some(Boolean);

  const loadUsers = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
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
    setSelectedIds(new Set());
  }, [applied, page, limit, sort, order]);

  useEffect(() => {
    apiGet<PaginatedList<GroupOption>>('/groups?limit=100&sort=name&order=asc')
      .then((result) => setGroupOptions(result.items || []))
      .catch(() => setGroupOptions([]));
    apiGet<PaginatedList<GroupOption>>('/organizations?limit=100&sort=name&order=asc')
      .then((result) => setOrgOptions(result.items || []))
      .catch(() => setOrgOptions([]));
  }, []);

  const onReset = () => {
    resetFilters(DEFAULT_FILTERS);
    setSort('createdAt');
    setOrder('desc');
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

  const pagination = data?.pagination;
  const users = data?.items || [];
  const pageIds = users.map((row) => row._id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));
  const selectedUsers = users.filter((row) => selectedIds.has(row._id));
  const selectedCount = selectedUsers.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  const handleDelete = async () => {
    if (!pendingDelete.length) return;
    setDeleting(true);
    setError(null);
    const results = await runForUsers(pendingDelete, (row) => apiDelete(`/users/${row._id}`));
    setDeleting(false);
    setPendingDelete([]);
    notifyBulkResult(results, {
      successTitle: 'Users moved to recycle bin',
      successMessage: 'Selected accounts can be restored from Recycle bin.',
    });
    if (results.ok) {
      setSelectedIds(new Set());
      await loadUsers({ silent: true });
    }
  };

  const isSelf = (row: UserRecord) => String(row._id) === String(currentUser?.id);

  const runForUsers = async (
    targets: UserRecord[],
    work: (row: UserRecord) => Promise<void>
  ) => {
    let ok = 0;
    const failed: string[] = [];
    for (const row of targets) {
      try {
        await work(row);
        ok += 1;
      } catch (err) {
        failed.push(`${row.username}: ${err instanceof Error ? err.message : 'Failed'}`);
      }
    }
    return { ok, failed };
  };

  const notifyBulkResult = (
    results: { ok: number; failed: string[] },
    copy: { successTitle: string; successMessage: string }
  ) => {
    if (results.ok) {
      pushToast({
        tone: results.failed.length ? 'warning' : 'success',
        title: copy.successTitle,
        message: results.failed.length
          ? `${results.ok} updated. ${results.failed.length} failed: ${results.failed[0]}`
          : copy.successMessage,
      });
    } else if (results.failed.length) {
      pushToast({
        tone: 'error',
        title: 'Update failed',
        message: results.failed[0],
      });
    }
  };

  const applyStatus = async (
    targets: UserRecord[],
    body: { isVerified?: boolean; isEnabled?: boolean },
    copy: { successTitle: string; successMessage: string; empty: string }
  ) => {
    if (!targets.length) {
      pushToast({ tone: 'info', title: copy.empty, message: 'No matching accounts in the selection.' });
      return;
    }
    setActionBusy(true);
    setError(null);
    const results = await runForUsers(targets, (row) => apiPut(`/users/${row._id}`, body));
    setActionBusy(false);
    notifyBulkResult(results, copy);
    if (results.ok) await loadUsers({ silent: true });
  };

  const handleVerifySelected = (verified: boolean) => {
    const targets = selectedUsers.filter((row) => Boolean(row.isVerified) !== verified);
    const skippedSelf = verified ? 0 : selectedUsers.filter(isSelf).length;
    const next = verified ? targets : targets.filter((row) => !isSelf(row));
    if (!verified && skippedSelf && !next.length) {
      pushToast({
        tone: 'warning',
        title: 'Cannot unverify your own account',
        message: 'Select other users to revoke verification.',
      });
      return;
    }
    void applyStatus(next, { isVerified: verified }, {
      successTitle: verified ? 'Users verified' : 'Verification revoked',
      successMessage: verified
        ? 'Selected accounts can sign in.'
        : 'Selected accounts cannot sign in until verified again.',
      empty: verified ? 'Already verified' : 'Already unverified',
    });
  };

  const handleBlockSelected = (blocked: boolean) => {
    const next = selectedUsers.filter((row) => (row.isEnabled === false) !== blocked && !isSelf(row));
    if (selectedUsers.some(isSelf) && !next.length) {
      pushToast({
        tone: 'warning',
        title: blocked ? 'Cannot block your own account' : 'Cannot change your own account',
        message: 'Select other users for this action.',
      });
      return;
    }
    void applyStatus(next, { isEnabled: !blocked }, {
      successTitle: blocked ? 'Users blocked' : 'Users unblocked',
      successMessage: blocked
        ? 'Selected accounts can no longer sign in.'
        : 'Selected accounts can sign in.',
      empty: blocked ? 'Already blocked' : 'Already unblocked',
    });
  };

  const handleDeleteSelected = () => {
    const next = selectedUsers.filter((row) => !isSelf(row));
    if (!next.length) {
      pushToast({
        tone: 'warning',
        title: 'Cannot delete your own account',
        message: 'Select other users to move to the recycle bin.',
      });
      return;
    }
    setPendingDelete(next);
  };

  const handleToggleEnabled = async (row: UserRecord) => {
    const nextEnabled = row.isEnabled === false;
    setActionBusy(true);
    setError(null);
    try {
      await apiPut(`/users/${row._id}`, { isEnabled: nextEnabled });
      pushToast({
        tone: 'success',
        title: nextEnabled ? 'User unblocked' : 'User blocked',
        message: nextEnabled
          ? `${row.username} can sign in.`
          : `${row.username} can no longer sign in.`,
      });
      await loadUsers({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleVerified = async (row: UserRecord) => {
    const next = !row.isVerified;
    setActionBusy(true);
    setError(null);
    try {
      await apiPut(`/users/${row._id}`, { isVerified: next });
      pushToast({
        tone: 'success',
        title: next ? 'User verified' : 'Verification revoked',
        message: next
          ? `${row.username} can sign in.`
          : `${row.username} can no longer sign in until verified again.`,
      });
      await loadUsers({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update verification.');
    } finally {
      setActionBusy(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allPageSelected ? new Set() : new Set(pageIds));
  };

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
          onSubmit={(event) => event.preventDefault()}
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
            <span className="text-[var(--muted)]">Enabled</span>
            <select
              value={filters.isEnabled}
              onChange={(e) => setFilters((prev) => ({ ...prev, isEnabled: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="true">Enabled</option>
              <option value="false">Blocked</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Organization</span>
            <select
              value={filters.organizationId}
              onChange={(e) => setFilters((prev) => ({ ...prev, organizationId: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {orgOptions.map((org) => (
                <option key={org._id} value={org._id}>
                  {org.name}
                </option>
              ))}
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

        {selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--accent-soft)]/40 px-4 py-2 text-sm">
            <span className="mr-1 font-medium text-[var(--foreground)]">
              {selectedCount} selected
            </span>
            <button
              type="button"
              className={bulkButtonClass()}
              disabled={!canWrite || actionBusy}
              onClick={() => handleVerifySelected(true)}
            >
              Verify
            </button>
            <button
              type="button"
              className={bulkButtonClass()}
              disabled={!canWrite || actionBusy}
              onClick={() => handleVerifySelected(false)}
            >
              Unverify
            </button>
            <button
              type="button"
              className={bulkButtonClass()}
              disabled={!canWrite || actionBusy}
              onClick={() => handleBlockSelected(true)}
            >
              Block
            </button>
            <button
              type="button"
              className={bulkButtonClass()}
              disabled={!canWrite || actionBusy}
              onClick={() => handleBlockSelected(false)}
            >
              Unblock
            </button>
            <button
              type="button"
              className={bulkButtonClass(true)}
              disabled={!canDelete || actionBusy}
              onClick={handleDeleteSelected}
            >
              Delete
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No users match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="headers-nowrap min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  {canSelect ? (
                    <th className="w-10 px-4 py-3">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all users on this page"
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </th>
                  ) : null}
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
                  {isVisible('organization') ? <th className="px-4 py-3 font-medium">Organization</th> : null}
                  {isVisible('groups') ? <th className="px-4 py-3 font-medium">Groups</th> : null}
                  {isVisible('verified') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('isVerified')} className="hover:text-[var(--accent)]">
                        Verified{sortIndicator('isVerified')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('enabled') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('isEnabled')} className="hover:text-[var(--accent)]">
                        Enabled{sortIndicator('isEnabled')}
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
                    className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass} ${
                      selectedIds.has(user._id) ? 'bg-[var(--accent-soft)]/30' : ''
                    }`}
                  >
                    {canSelect ? (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(user._id)}
                          onChange={() => toggleSelected(user._id)}
                          aria-label={`Select ${user.username}`}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                    ) : null}
                    {isVisible('username') ? (
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/admin/users/${user._id}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {user.username}
                        </Link>
                      </td>
                    ) : null}
                    {isVisible('email') ? <td className="px-4 py-3">{user.email}</td> : null}
                    {isVisible('organization') ? (
                      <td className="px-4 py-3">{user.organization?.name || '—'}</td>
                    ) : null}
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
                    {isVisible('enabled') ? (
                      <td className="px-4 py-3">
                        {user.isEnabled === false ? (
                          <span className="font-medium text-[var(--muted)]">Blocked</span>
                        ) : (
                          <span className="text-emerald-700">Enabled</span>
                        )}
                      </td>
                    ) : null}
                    {isVisible('lastLogin') ? (
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(user.lastLoginAt)}</td>
                    ) : null}
                    {isVisible('actions') ? (
                      <td className="px-4 py-3 text-right">
                        <TableActionRow alwaysVisible>
                          <AccessIconButton
                            allowed={canWrite}
                            icon="edit"
                            label="Edit"
                            onClick={() => setEditingUser(user)}
                          />
                          <RowActionsMenu
                            items={[
                              {
                                id: 'view',
                                label: 'View',
                                allowed: isAdmin,
                                href: `/admin/users/${user._id}`,
                              },
                              {
                                id: 'verify',
                                label: user.isVerified ? 'Unverify' : 'Verify',
                                allowed: canWrite,
                                disabled: actionBusy || (Boolean(user.isVerified) && isSelf(user)),
                                reason:
                                  user.isVerified && isSelf(user)
                                    ? 'You cannot unverify your own account.'
                                    : undefined,
                                onSelect: () => void handleToggleVerified(user),
                              },
                              {
                                id: 'block',
                                label: user.isEnabled === false ? 'Unblock' : 'Block',
                                allowed: canWrite,
                                disabled: actionBusy || isSelf(user),
                                reason: isSelf(user)
                                  ? 'You cannot block your own account.'
                                  : undefined,
                                onSelect: () => void handleToggleEnabled(user),
                              },
                              {
                                id: 'access',
                                label: 'Access',
                                allowed: canManageAcl,
                                onSelect: () => setAclUser(user),
                              },
                              {
                                id: 'password',
                                label: 'Change password',
                                allowed: canWrite,
                                onSelect: () => setPasswordUser(user),
                              },
                              {
                                id: 'delete',
                                label: 'Delete',
                                allowed: canDelete,
                                danger: true,
                                disabled: actionBusy || isSelf(user),
                                reason: isSelf(user)
                                  ? 'You cannot delete your own account.'
                                  : undefined,
                                onSelect: () => setPendingDelete([user]),
                              },
                            ]}
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

      <EditUserModal
        isOpen={Boolean(editingUser)}
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={({ username }) => {
          pushToast({
            tone: 'success',
            title: 'User updated',
            message: `${username} was saved.`,
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

      <PermissionModal
        isOpen={Boolean(aclUser)}
        onClose={() => setAclUser(null)}
        onApplied={() => setAclUser(null)}
        initialPrincipalType="USER"
        initialPrincipalId={aclUser?._id || null}
      />

      <ConfirmDeleteDialog
        isOpen={pendingDelete.length > 0}
        onClose={() => setPendingDelete([])}
        onConfirm={handleDelete}
        title="Move to recycle bin"
        itemLabel={
          pendingDelete.length === 1 ? pendingDelete[0]?.username : `${pendingDelete.length} users`
        }
        description={
          pendingDelete.length === 1
            ? `Move “${pendingDelete[0].username}” to the recycle bin? An administrator can restore it later.`
            : `Move ${pendingDelete.length} accounts to the recycle bin? An administrator can restore them later.`
        }
        confirmLabel="Move to bin"
        busy={deleting}
      />
    </div>
  );
}
