"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import { useAccess } from '@/components/AccessProvider';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import {
  AccessIconButton,
  AccessIconLink,
  TableActionRow,
  tableActionRowGroupClass,
} from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { ownerName, type FundingListResponse } from '@/lib/fundingTypes';

export interface FundingColumn<T> {
  id: string;
  label: string;
  alwaysVisible?: boolean;
  sortable?: boolean;
  className?: string;
  render: (row: T) => ReactNode;
}

interface FundingCatalogListProps<T extends { _id: string; name: string }> {
  title: string;
  description: string;
  noun: string;
  endpoint: string;
  createHref: string;
  detailBase: string;
  tableId: string;
  permissionKind: 'SPONSOR' | 'OPPORTUNITY' | 'PROJECT';
  columns: FundingColumn<T>[];
  searchPlaceholder?: string;
}

export default function FundingCatalogList<T extends { _id: string; name: string }>({
  title,
  description,
  noun,
  endpoint,
  createHref,
  detailBase,
  tableId,
  permissionKind,
  columns,
  searchPlaceholder = 'Name or description',
}: FundingCatalogListProps<T>) {
  const { pushToast } = useToast();
  const { can, isAdmin } = useAccess();
  const canCreate = can(`${permissionKind}:CREATE`, { classWideOnly: true });

  const columnDefs: ColumnDef[] = useMemo(
    () => [
      ...columns.map((col) => ({
        id: col.id,
        label: col.label,
        alwaysVisible: col.alwaysVisible,
      })),
      { id: 'actions', label: 'Actions', alwaysVisible: true },
    ],
    [columns]
  );
  const { isVisible, toggle: toggleColumn } = useColumnVisibility(tableId, columnDefs, {
    enabled: isAdmin,
  });

  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [data, setData] = useState<FundingListResponse<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

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
      if (search) params.set('search', search);
      const response = await apiGet<FundingListResponse<T>>(`${endpoint}?${params.toString()}`);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${noun.toLowerCase()}s.`);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [endpoint, noun, page, limit, sort, order, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const toggleSort = (field: string) => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder(field === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`${endpoint}/${pendingDelete._id}`);
      pushToast({
        tone: 'info',
        title: `${noun} deleted`,
        message: `${pendingDelete.name} was removed.`,
      });
      setPendingDelete(null);
      await load();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : `Could not delete ${noun.toLowerCase()}.`,
      });
    } finally {
      setDeleting(false);
    }
  };

  const sortMark = (field: string) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  const items = data?.items || [];
  const totalPages = data?.totalPages || 0;
  const total = data?.total || 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: title }]} />
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">{description}</p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      {showFilters ? (
        <form
          onSubmit={handleSearch}
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Search</span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={searchPlaceholder}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Apply filters
            </button>
          </div>
        </form>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>
            {total === 0
              ? `0 ${noun.toLowerCase()}s`
              : `${total} ${noun.toLowerCase()}${total === 1 ? '' : 's'} · page ${page} of ${totalPages || 1}`}
            {search ? ' · filters active' : ''}
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
                {[5, 10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            {canCreate ? (
              <Link
                href={createHref}
                className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
              >
                Create {noun.toLowerCase()}
              </Link>
            ) : (
              <AccessPrimaryButton allowed={false}>Create {noun.toLowerCase()}</AccessPrimaryButton>
            )}
            <TableOptionsMenu
              columns={isAdmin ? columnDefs : []}
              isVisible={isAdmin ? isVisible : undefined}
              toggle={isAdmin ? toggleColumn : undefined}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters((prev) => !prev)}
            />
          </div>
        </div>

        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading {noun.toLowerCase()}s…</p>
        ) : items.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No {noun.toLowerCase()}s match your filters.</p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)] md:hidden">
              {items.map((row) => (
                <li key={row._id} className="space-y-3 p-4">
                  <div>
                    <p className="font-medium break-words">{row.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      Owner: {ownerName((row as { ownerId?: Parameters<typeof ownerName>[0] }).ownerId)}
                    </p>
                  </div>
                  <TableActionRow alwaysVisible>
                    <AccessIconLink
                      allowed={can(`${permissionKind}:READ`, { resourceId: row._id })}
                      href={`${detailBase}/${row._id}`}
                      icon="view"
                      label="View"
                    />
                    <AccessIconButton
                      allowed={can(`${permissionKind}:DELETE`, { resourceId: row._id })}
                      icon="delete"
                      label="Delete"
                      danger
                      onClick={() => setPendingDelete(row)}
                    />
                  </TableActionRow>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                  <tr>
                    {columns.map((col) =>
                      isVisible(col.id) ? (
                        <th key={col.id} className={`px-4 py-3 font-medium ${col.className || ''}`}>
                          {col.sortable ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(col.id)}
                              className="hover:text-[var(--foreground)]"
                            >
                              {col.label}
                              {sortMark(col.id)}
                            </button>
                          ) : (
                            col.label
                          )}
                        </th>
                      ) : null
                    )}
                    {isVisible('actions') ? (
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row._id}
                      className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                    >
                      {columns.map((col) =>
                        isVisible(col.id) ? (
                          <td key={col.id} className={`px-4 py-3 ${col.className || ''}`}>
                            {col.render(row)}
                          </td>
                        ) : null
                      )}
                      {isVisible('actions') ? (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <TableActionRow>
                            <AccessIconLink
                              allowed={can(`${permissionKind}:READ`, { resourceId: row._id })}
                              href={`${detailBase}/${row._id}`}
                              icon="view"
                              label="View"
                            />
                            <AccessIconButton
                              allowed={can(`${permissionKind}:DELETE`, { resourceId: row._id })}
                              icon="delete"
                              label="Delete"
                              danger
                              onClick={() => setPendingDelete(row)}
                            />
                          </TableActionRow>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[var(--muted)]">
            {total === 0
              ? `0 ${noun.toLowerCase()}s`
              : `Showing page ${data?.page || page} of ${totalPages} (${total} total)`}
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
        itemLabel={pendingDelete?.name}
        busy={deleting}
      />
    </div>
  );
}
