"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import { useAccess } from '@/components/AccessProvider';
import { useToast } from '@/components/ToastProvider';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import {
  AccessIconButton,
  AccessIconLink,
  TableActionRow,
} from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { useAutoAppliedFilters } from '@/lib/useDebouncedValue';
import { formatPlanStatus, type LocalPlanRecord } from '@/lib/localPlan';

type ListResponse = {
  items: LocalPlanRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type SortField = 'name' | 'status' | 'updatedAt' | 'sourceRevision';

const COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Plan', alwaysVisible: true },
  { id: 'county', label: 'County' },
  { id: 'survey', label: 'Survey' },
  { id: 'status', label: 'Status' },
  { id: 'revision', label: 'Revision' },
  { id: 'updated', label: 'Updated' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

const DEFAULT_FILTERS = { q: '', status: '' };

export default function LocalPlansPage() {
  const { can, isAdmin } = useAccess();
  const { pushToast } = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LocalPlanRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canCreate = can('LOCALPLAN:CREATE', { classWideOnly: true });
  const canRead = can('LOCALPLAN:READ', { allowAnyInstance: true }) || can('COUNTY:READ', { allowAnyInstance: true });

  const { filters, setFilters, applied, page, setPage, resetFilters } = useAutoAppliedFilters(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortField>('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const columns = useMemo(() => COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('local-plans', columns);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
        order,
      });
      if (applied.q) params.set('search', applied.q);
      if (applied.status) params.set('status', applied.status);
      const response = await apiGet<ListResponse>(`/localplans?${params.toString()}`);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load local plans.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [applied.q, applied.status, limit, order, page, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/localplans/${pendingDelete._id}`);
      pushToast({
        tone: 'info',
        title: 'Local plan moved to recycle bin',
        message: 'An administrator can restore it later.',
      });
      setPendingDelete(null);
      await load();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Could not delete this local plan.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sort === field) setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(field);
      setOrder(field === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const sortMark = (field: SortField) => (sort === field ? (order === 'asc' ? ' ↑' : ' ↓') : '');
  const items = data?.items || [];
  const totalPages = data?.totalPages || 0;
  const total = data?.total || 0;

  if (!canRead && !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <p className="text-[var(--muted)]">You do not have permission to view local plans.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Local plans' }]} />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Local plans</h1>
            <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
              Generated from approved county surveys. One plan per county and survey can be the default.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((open) => !open)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
            >
              {showFilters ? 'Hide filters' : 'Filters'}
            </button>
            {canCreate ? (
              <Link
                href="/localplans/new"
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
              >
                New local plan
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {showFilters ? (
        <form
          onSubmit={(event) => event.preventDefault()}
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Search</span>
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="default">Default</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => resetFilters(DEFAULT_FILTERS)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
            >
              Reset
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>
            {loading ? '—' : total === 0 ? '0 local plans' : `${total} local plan${total === 1 ? '' : 's'}`}
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <span>Page size</span>
              <select
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-[var(--border)] px-2 py-1"
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <TableOptionsMenu columns={columns} isVisible={isVisible} toggle={toggle} />
          </div>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-sm text-[var(--muted)]">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  {isVisible('name') ? (
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('name')}>
                        Plan{sortMark('name')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('county') ? <th className="px-4 py-3">County</th> : null}
                  {isVisible('survey') ? <th className="px-4 py-3">Survey</th> : null}
                  {isVisible('status') ? (
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('status')}>
                        Status{sortMark('status')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('revision') ? (
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('sourceRevision')}>
                        Revision{sortMark('sourceRevision')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('updated') ? (
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('updatedAt')}>
                        Updated{sortMark('updatedAt')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('actions') ? <th className="px-4 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                      No local plans yet.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row._id} className="border-t border-[var(--border)]">
                      {isVisible('name') ? (
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/localplans/${row._id}`} className="text-[var(--accent)] hover:underline">
                            {row.name}
                          </Link>
                        </td>
                      ) : null}
                      {isVisible('county') ? <td className="px-4 py-3">{row.countyName || '—'}</td> : null}
                      {isVisible('survey') ? <td className="px-4 py-3">{row.surveyName || '—'}</td> : null}
                      {isVisible('status') ? (
                        <td className="px-4 py-3">
                          <span
                            className={
                              row.status === 'default'
                                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                                : 'text-[var(--muted)]'
                            }
                          >
                            {formatPlanStatus(row.status)}
                          </span>
                        </td>
                      ) : null}
                      {isVisible('revision') ? <td className="px-4 py-3">{row.sourceRevision}</td> : null}
                      {isVisible('updated') ? (
                        <td className="px-4 py-3">
                          {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}
                        </td>
                      ) : null}
                      {isVisible('actions') ? (
                        <td className="px-4 py-3 text-right">
                          <TableActionRow>
                            <AccessIconLink allowed href={`/localplans/${row._id}`} icon="edit" label="Edit" />
                            <AccessIconButton
                              allowed={isAdmin || can('LOCALPLAN:DELETE', { resourceId: row._id })}
                              icon="delete"
                              label="Delete"
                              danger
                              onClick={() => setPendingDelete(row)}
                            />
                          </TableActionRow>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-between border-t border-[var(--border)] px-4 py-3 text-sm">
          <p className="text-[var(--muted)]">
            {total === 0 ? '0 local plans' : `Page ${data?.page || page} of ${totalPages}`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={totalPages === 0 || page >= totalPages || loading}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title="Move to recycle bin"
        itemLabel={pendingDelete?.name}
        confirmLabel="Move to bin"
        busy={deleting}
      />
    </div>
  );
}
