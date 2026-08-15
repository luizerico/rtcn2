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
import {
  geoId,
  geoLabel,
  type BiomeRecord,
  type CountyRecord,
  type RegionRecord,
  type StateRecord,
} from '@/lib/geoTypes';

type SortField = 'name' | 'code' | 'IBGECode' | 'population';

const COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', alwaysVisible: true },
  { id: 'IBGECode', label: 'IBGE' },
  { id: 'code', label: 'Code' },
  { id: 'state', label: 'State' },
  { id: 'region', label: 'Region' },
  { id: 'biome', label: 'Biome' },
  { id: 'population', label: 'Population' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

export default function CountyCatalogList() {
  const searchParams = useSearchParams();
  const { isAdmin } = useAccess();

  const initialFilters = useMemo(
    () => ({
      q: searchParams.get('q') || '',
      regionId: searchParams.get('regionId') || '',
      stateId: searchParams.get('stateId') || '',
      biomeId: searchParams.get('biomeId') || '',
    }),
    [searchParams]
  );

  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [sort, setSort] = useState<SortField>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(Object.values(initialFilters).some(Boolean));
  const [data, setData] = useState<PaginatedList<CountyRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionOptions, setRegionOptions] = useState<RegionRecord[]>([]);
  const [stateOptions, setStateOptions] = useState<StateRecord[]>([]);
  const [biomeOptions, setBiomeOptions] = useState<BiomeRecord[]>([]);

  const { isVisible, toggle } = useColumnVisibility('admin-geo-counties', COLUMNS, {
    enabled: isAdmin,
  });

  const hasActiveFilters = Object.values(applied).some(Boolean);
  const rows = data?.items || [];
  const pagination = data?.pagination;

  const loadOptions = useCallback(async () => {
    try {
      const [regions, states, biomes] = await Promise.all([
        apiGet<PaginatedList<RegionRecord>>('/regions?limit=100&sort=name&order=asc'),
        apiGet<PaginatedList<StateRecord>>('/states?limit=100&sort=name&order=asc'),
        apiGet<PaginatedList<BiomeRecord>>('/biomes?limit=100&sort=name&order=asc'),
      ]);
      setRegionOptions(regions.items || []);
      setStateOptions(states.items || []);
      setBiomeOptions(biomes.items || []);
    } catch {
      // Non-fatal.
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildListParams({ page, limit, sort, order, filters: applied });
      const result = await apiGet<PaginatedList<CountyRecord>>(`/counties?${params}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load counties.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [applied, limit, order, page, sort]);

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
    const empty = { q: '', regionId: '', stateId: '', biomeId: '' };
    setFilters(empty);
    setApplied(empty);
    setSort('name');
    setOrder('asc');
    setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder(field === 'population' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const sortIndicator = (field: SortField) => {
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
            { label: 'Counties' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Counties</h1>
        <p className="mt-2 text-[var(--muted)]">
          Municipalities. Status and emissions open on the detail page. Filtering runs on the API.
        </p>
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
              placeholder="Name, code, or IBGE…"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Biome</span>
            <select
              value={filters.biomeId}
              onChange={(e) => setFilters((prev) => ({ ...prev, biomeId: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {biomeOptions.map((biome) => (
                <option key={biome._id} value={biome._id}>
                  {biome.code} · {biome.name}
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
                ? '0 counties'
                : `${pagination.total} counties · page ${pagination.page} of ${pagination.totalPages}`
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
            <TableOptionsMenu
              columns={isAdmin ? COLUMNS : []}
              isVisible={isAdmin ? isVisible : undefined}
              toggle={isAdmin ? toggle : undefined}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters((prev) => !prev)}
            />
          </div>
        </div>

        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading counties…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No counties match these filters.</p>
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
                  {isVisible('IBGECode') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('IBGECode')} className="hover:text-[var(--accent)]">
                        IBGE{sortIndicator('IBGECode')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('code') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('code')} className="hover:text-[var(--accent)]">
                        Code{sortIndicator('code')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('state') ? <th className="px-4 py-3 font-medium">State</th> : null}
                  {isVisible('region') ? <th className="px-4 py-3 font-medium">Region</th> : null}
                  {isVisible('biome') ? <th className="px-4 py-3 font-medium">Biome</th> : null}
                  {isVisible('population') ? (
                    <th className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('population')}
                        className="hover:text-[var(--accent)]"
                      >
                        Population{sortIndicator('population')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('actions') ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row._id}
                    className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                  >
                    {isVisible('name') ? (
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/admin/geography/counties/${row._id}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                    ) : null}
                    {isVisible('IBGECode') ? (
                      <td className="px-4 py-3 font-mono text-xs">{row.IBGECode || '—'}</td>
                    ) : null}
                    {isVisible('code') ? <td className="px-4 py-3 font-mono text-xs">{row.code || '—'}</td> : null}
                    {isVisible('state') ? (
                      <td className="px-4 py-3">
                        {geoId(row.state) ? (
                          <Link
                            href={`/admin/geography/states/${geoId(row.state)}`}
                            className="text-[var(--accent)] hover:underline"
                          >
                            {geoLabel(row.state)}
                          </Link>
                        ) : (
                          geoLabel(row.state)
                        )}
                      </td>
                    ) : null}
                    {isVisible('region') ? (
                      <td className="px-4 py-3">
                        {geoId(row.region) ? (
                          <Link
                            href={`/admin/geography/regions/${geoId(row.region)}`}
                            className="text-[var(--accent)] hover:underline"
                          >
                            {geoLabel(row.region)}
                          </Link>
                        ) : (
                          geoLabel(row.region)
                        )}
                      </td>
                    ) : null}
                    {isVisible('biome') ? (
                      <td className="px-4 py-3">
                        {geoId(row.biome) ? (
                          <Link
                            href={`/admin/geography/biomes/${geoId(row.biome)}`}
                            className="text-[var(--accent)] hover:underline"
                          >
                            {geoLabel(row.biome)}
                          </Link>
                        ) : (
                          geoLabel(row.biome)
                        )}
                      </td>
                    ) : null}
                    {isVisible('population') ? (
                      <td className="px-4 py-3">
                        {row.population != null ? row.population.toLocaleString() : '—'}
                      </td>
                    ) : null}
                    {isVisible('actions') ? (
                      <td className="px-4 py-3 text-right">
                        <TableActionRow>
                          <AccessIconLink
                            allowed
                            href={`/admin/geography/counties/${row._id}`}
                            icon="view"
                            label={`View ${row.name}`}
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
                ? '0 counties'
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
