"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiGet } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import { useAccess } from '@/components/AccessProvider';
import { AccessIconLink, TableActionRow, tableActionRowGroupClass } from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { buildListParams, type PaginatedList } from '@/lib/listTypes';
import { geoId, geoLabel, type GeoRef, type RegionRecord, type StateRecord } from '@/lib/geoTypes';

export type GeoSortField = 'code' | 'name';

export interface GeoListRow {
  _id: string;
  code?: string;
  name: string;
  region?: GeoRef | string;
  state?: GeoRef | string;
}

interface GeoCatalogListProps {
  title: string;
  description: string;
  noun: string;
  endpoint: string;
  tableId: string;
  detailBase: string;
  showRegion?: boolean;
  showState?: boolean;
  showRegionFilter?: boolean;
  showStateFilter?: boolean;
}

const BASE_COLUMNS: ColumnDef[] = [
  { id: 'code', label: 'Code' },
  { id: 'name', label: 'Name', alwaysVisible: true },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

export default function GeoCatalogList({
  title,
  description,
  noun,
  endpoint,
  tableId,
  detailBase,
  showRegion = false,
  showState = false,
  showRegionFilter = false,
  showStateFilter = false,
}: GeoCatalogListProps) {
  const searchParams = useSearchParams();
  const { isAdmin } = useAccess();

  const initialFilters = useMemo(
    () => ({
      q: searchParams.get('q') || '',
      regionId: searchParams.get('regionId') || '',
      stateId: searchParams.get('stateId') || '',
    }),
    [searchParams]
  );

  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [sort, setSort] = useState<GeoSortField>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(
    Boolean(initialFilters.q || initialFilters.regionId || initialFilters.stateId)
  );

  const [data, setData] = useState<PaginatedList<GeoListRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionOptions, setRegionOptions] = useState<RegionRecord[]>([]);
  const [stateOptions, setStateOptions] = useState<StateRecord[]>([]);

  const columns = useMemo(() => {
    const extra: ColumnDef[] = [];
    if (showRegion) extra.push({ id: 'region', label: 'Region' });
    if (showState) extra.push({ id: 'state', label: 'State' });
    return [BASE_COLUMNS[0], BASE_COLUMNS[1], ...extra, BASE_COLUMNS[2]];
  }, [showRegion, showState]);

  const { isVisible, toggle } = useColumnVisibility(tableId, columns, {
    enabled: isAdmin,
  });

  const hasActiveFilters = Object.values(applied).some(Boolean);
  const rows = data?.items || [];
  const pagination = data?.pagination;

  const loadOptions = useCallback(async () => {
    try {
      if (showRegionFilter) {
        const result = await apiGet<PaginatedList<RegionRecord>>('/regions?limit=100&sort=name&order=asc');
        setRegionOptions(result.items || []);
      }
      if (showStateFilter) {
        const result = await apiGet<PaginatedList<StateRecord>>('/states?limit=100&sort=name&order=asc');
        setStateOptions(result.items || []);
      }
    } catch {
      // Non-fatal: dropdowns stay empty.
    }
  }, [showRegionFilter, showStateFilter]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filterParams: Record<string, string> = { q: applied.q };
      if (showRegionFilter) filterParams.regionId = applied.regionId;
      if (showStateFilter) filterParams.stateId = applied.stateId;
      const params = buildListParams({ page, limit, sort, order, filters: filterParams });
      const result = await apiGet<PaginatedList<GeoListRow>>(`${endpoint}?${params}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${noun}.`);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [applied, endpoint, limit, noun, order, page, showRegionFilter, showStateFilter, sort]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const onReset = () => {
    const empty = { q: '', regionId: '', stateId: '' };
    setFilters(empty);
    setApplied(empty);
    setSort('name');
    setOrder('asc');
    setPage(1);
  };

  const toggleSort = (field: GeoSortField) => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder('asc');
    }
    setPage(1);
  };

  const sortIndicator = (field: GeoSortField) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Geography', href: '/admin/geography' },
            { label: title },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-[var(--muted)]">{description}</p>
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
              placeholder="Code or name…"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          {showRegionFilter ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Region</span>
              <select
                value={filters.regionId}
                onChange={(e) => setFilters((prev) => ({ ...prev, regionId: e.target.value }))}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
              >
                <option value="">All</option>
                {regionOptions.map((region) => (
                  <option key={region._id} value={region._id}>
                    {region.code} · {region.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {showStateFilter ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">State</span>
              <select
                value={filters.stateId}
                onChange={(e) => setFilters((prev) => ({ ...prev, stateId: e.target.value }))}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
              >
                <option value="">All</option>
                {stateOptions.map((state) => (
                  <option key={state._id} value={state._id}>
                    {state.code} · {state.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>
            {pagination
              ? pagination.total === 0
                ? `0 ${noun}`
                : `${pagination.total} ${noun} · page ${pagination.page} of ${pagination.totalPages}`
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
          <p className="p-5 text-[var(--muted)]">Loading {noun}…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No {noun} match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  {isVisible('code') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('code')} className="hover:text-[var(--accent)]">
                        Code{sortIndicator('code')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('name') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('name')} className="hover:text-[var(--accent)]">
                        Name{sortIndicator('name')}
                      </button>
                    </th>
                  ) : null}
                  {showRegion && isVisible('region') ? <th className="px-4 py-3 font-medium">Region</th> : null}
                  {showState && isVisible('state') ? <th className="px-4 py-3 font-medium">State</th> : null}
                  {isVisible('actions') ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const regionHref = geoId(row.region);
                  const stateHref = geoId(row.state);
                  return (
                    <tr
                      key={row._id}
                      className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                    >
                      {isVisible('code') ? (
                        <td className="px-4 py-3 font-mono text-xs">{row.code || '—'}</td>
                      ) : null}
                      {isVisible('name') ? (
                        <td className="px-4 py-3 font-medium">
                          <Link href={`${detailBase}/${row._id}`} className="text-[var(--accent)] hover:underline">
                            {row.name}
                          </Link>
                        </td>
                      ) : null}
                      {showRegion && isVisible('region') ? (
                        <td className="px-4 py-3">
                          {regionHref ? (
                            <Link
                              href={`/admin/geography/regions/${regionHref}`}
                              className="text-[var(--accent)] hover:underline"
                            >
                              {geoLabel(row.region)}
                            </Link>
                          ) : (
                            geoLabel(row.region)
                          )}
                        </td>
                      ) : null}
                      {showState && isVisible('state') ? (
                        <td className="px-4 py-3">
                          {stateHref ? (
                            <Link
                              href={`/admin/geography/states/${stateHref}`}
                              className="text-[var(--accent)] hover:underline"
                            >
                              {geoLabel(row.state)}
                            </Link>
                          ) : (
                            geoLabel(row.state)
                          )}
                        </td>
                      ) : null}
                      {isVisible('actions') ? (
                        <td className="px-4 py-3 text-right">
                          <TableActionRow>
                            <AccessIconLink
                              allowed
                              href={`${detailBase}/${row._id}`}
                              icon="view"
                              label={`View ${row.name}`}
                            />
                          </TableActionRow>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[var(--muted)]">
            {pagination
              ? pagination.total === 0
                ? `0 ${noun}`
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
    </div>
  );
}
