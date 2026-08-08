"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import EditMembersModal, { EditMembersPayload } from '@/components/ui/EditMembersModal';
import CreateGroupModal from '@/components/ui/CreateGroupModal';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import ColumnVisibilityMenu from '@/components/ui/ColumnVisibilityMenu';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import { AccessPrimaryButton, AccessTextButton } from '@/components/ui/AccessControls';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { buildListParams, type PaginatedList } from '@/lib/listTypes';

interface GroupRecord {
  _id: string;
  name: string;
  description?: string;
  members?: string[];
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

type SortField = 'name' | 'createdAt' | 'updatedAt' | 'memberCount';

const GROUP_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', alwaysVisible: true },
  { id: 'description', label: 'Description' },
  { id: 'members', label: 'Members' },
  { id: 'updated', label: 'Updated' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

const DEFAULT_FILTERS = {
  q: '',
  name: '',
};

export default function AdminGroupsPage() {
  const { pushToast } = useToast();
  const { can, isAdmin } = useAccess();
  const canCreate = can('GROUP:CREATE');
  const canWrite = can('GROUP:WRITE');
  const canDelete = can('GROUP:DELETE');

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortField>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(false);

  const [data, setData] = useState<PaginatedList<GroupRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<GroupRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const columns = useMemo(() => GROUP_COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('admin-groups', columns, {
    enabled: isAdmin,
  });

  const hasActiveFilters = Object.values(applied).some(Boolean);
  const groups = data?.items || [];
  const selectedGroup = groups.find((group) => group._id === selectedGroupId) || null;
  const pagination = data?.pagination;

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildListParams({ page, limit, sort, order, filters: applied });
      const result = await apiGet<PaginatedList<GroupRecord>>(`/groups?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [applied, limit, order, page, sort]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const onReset = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setSort('name');
    setOrder('asc');
    setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder(field === 'name' ? 'asc' : 'desc');
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
      await apiDelete(`/groups/${pendingDelete._id}`);
      pushToast({ tone: 'info', title: 'Group deleted', message: 'The group was removed.' });
      setPendingDelete(null);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group.');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddMember = async ({ userId }: EditMembersPayload) => {
    if (!selectedGroupId) return;
    await apiPost(`/groups/${selectedGroupId}/members`, { targetUserId: userId });
    await loadGroups();
  };

  const handleRemoveMember = async ({ userId }: EditMembersPayload) => {
    if (!selectedGroupId) return;
    await apiDelete(`/groups/${selectedGroupId}/members`, { targetUserId: userId });
    await loadGroups();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Groups' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mt-2 text-3xl font-semibold">Group management</h1>
            <p className="mt-2 text-[var(--muted)]">
              Search, filter, and manage groups. Filtering runs on the API.
            </p>
          </div>
          <AccessPrimaryButton allowed={canCreate} onClick={() => setCreateOpen(true)}>
            Create group
          </AccessPrimaryButton>
        </div>
      </header>

      {showFilters ? (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Search</span>
            <input
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Name or description…"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Name</span>
            <input
              value={filters.name}
              onChange={(e) => setFilters((prev) => ({ ...prev, name: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <div className="flex items-end gap-2 md:col-span-3">
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
                ? '0 groups'
                : `${pagination.total} group${pagination.total === 1 ? '' : 's'} · page ${pagination.page} of ${pagination.totalPages}`
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
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--accent-soft)]/40"
              aria-expanded={showFilters}
            >
              {showFilters ? 'Hide filters' : 'Show filters'}
            </button>
            {isAdmin ? (
              <ColumnVisibilityMenu columns={columns} isVisible={isVisible} toggle={toggle} />
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading groups…</p>
        ) : groups.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No groups match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  {isVisible('name') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('name')} className="hover:text-[var(--accent)]">
                        Name{sortIndicator('name')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('description') ? (
                    <th className="px-4 py-3 font-medium">Description</th>
                  ) : null}
                  {isVisible('members') ? (
                    <th className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('memberCount')}
                        className="hover:text-[var(--accent)]"
                      >
                        Members{sortIndicator('memberCount')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('updated') ? (
                    <th className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('updatedAt')}
                        className="hover:text-[var(--accent)]"
                      >
                        Updated{sortIndicator('updatedAt')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('actions') ? (
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group._id} className="border-b border-[var(--border)] last:border-0">
                    {isVisible('name') ? (
                      <td className="px-4 py-3 font-medium">{group.name}</td>
                    ) : null}
                    {isVisible('description') ? (
                      <td className="px-4 py-3">{group.description || '—'}</td>
                    ) : null}
                    {isVisible('members') ? (
                      <td className="px-4 py-3">
                        {typeof group.memberCount === 'number'
                          ? group.memberCount
                          : group.members?.length || 0}
                      </td>
                    ) : null}
                    {isVisible('updated') ? (
                      <td className="px-4 py-3 whitespace-nowrap">
                        {group.updatedAt ? new Date(group.updatedAt).toLocaleString() : '—'}
                      </td>
                    ) : null}
                    {isVisible('actions') ? (
                      <td className="space-x-3 px-4 py-3 text-right">
                        <AccessTextButton
                          allowed={canWrite}
                          onClick={() => {
                            setSelectedGroupId(group._id);
                            setMemberModalOpen(true);
                          }}
                        >
                          Edit members
                        </AccessTextButton>
                        <AccessTextButton
                          allowed={canDelete}
                          danger
                          onClick={() => setPendingDelete(group)}
                        >
                          Delete
                        </AccessTextButton>
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
                ? '0 groups'
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

      <CreateGroupModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={({ name }) => {
          pushToast({ tone: 'success', title: 'Group created', message: `${name} was added.` });
          void loadGroups();
        }}
      />

      <EditMembersModal
        isOpen={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        groupName={selectedGroup?.name}
        memberIds={selectedGroup?.members?.map(String) || []}
        onAddUser={handleAddMember}
        onRemoveUser={handleRemoveMember}
      />

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        itemLabel={pendingDelete?.name}
        busy={deleting}
      />
    </div>
  );
}
