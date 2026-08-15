"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet } from '@/lib/apiUtils';
import { useAccess } from '@/components/AccessProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { buildListParams, type PaginatedList } from '@/lib/listTypes';
import {
  geoId,
  geoLabel,
  type CountyEmissionRecord,
  type CountyRecord,
  type YearlyValue,
} from '@/lib/geoTypes';

type EmissionSortField =
  | 'year'
  | 'sector'
  | 'category'
  | 'subCategory'
  | 'product'
  | 'activity'
  | 'actionType'
  | 'gasType'
  | 'detail'
  | 'value';

const EMISSION_COLUMNS: ColumnDef[] = [
  { id: 'year', label: 'Year', alwaysVisible: true },
  { id: 'sector', label: 'Sector' },
  { id: 'category', label: 'Category' },
  { id: 'subCategory', label: 'Subcategory', defaultVisible: false },
  { id: 'product', label: 'Product' },
  { id: 'activity', label: 'Activity', defaultVisible: false },
  { id: 'actionType', label: 'Action type', defaultVisible: false },
  { id: 'gasType', label: 'Gas type', defaultVisible: false },
  { id: 'detail', label: 'Detail', defaultVisible: false },
  { id: 'value', label: 'Value', align: 'right' },
];

const EMPTY_EMISSION_FILTERS = { q: '', year: '', sector: '' };

function emissionCell(row: CountyEmissionRecord, columnId: string): string {
  const value = row[columnId as keyof CountyEmissionRecord];
  if (value == null || value === '') return '—';
  if (columnId === 'value' && typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  return String(value);
}

function ParentLink({
  hrefBase,
  refValue,
}: {
  hrefBase: string;
  refValue?: CountyRecord['region'];
}) {
  const id = geoId(refValue);
  if (!id) return <span>{geoLabel(refValue)}</span>;
  return (
    <Link href={`${hrefBase}/${id}`} className="text-[var(--accent)] hover:underline">
      {geoLabel(refValue)}
    </Link>
  );
}

function YearlyTable({
  title,
  rows,
  extraHeader,
  extraCell,
}: {
  title: string;
  rows: Array<YearlyValue & { riskType?: string }>;
  extraHeader?: string;
  extraCell?: (row: YearlyValue & { riskType?: string }) => string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-[var(--muted)]">No records.</p>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Year</th>
              <th className="px-4 py-2 font-medium">Value</th>
              {extraHeader ? <th className="px-4 py-2 font-medium">{extraHeader}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.year}-${index}`} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-2">{row.year ?? '—'}</td>
                <td className="px-4 py-2">{row.value ?? '—'}</td>
                {extraHeader ? <td className="px-4 py-2">{extraCell?.(row) || '—'}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function CountyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { isAdmin } = useAccess();
  const columns = useMemo(() => EMISSION_COLUMNS, []);
  const { isVisible, toggle, visibleColumns } = useColumnVisibility('admin-geo-emissions', columns, {
    enabled: isAdmin,
  });
  const [county, setCounty] = useState<CountyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [emissionQ, setEmissionQ] = useState('');
  const [emissionYear, setEmissionYear] = useState('');
  const [emissionSector, setEmissionSector] = useState('');
  const [appliedEmissions, setAppliedEmissions] = useState(EMPTY_EMISSION_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [emissionSort, setEmissionSort] = useState<EmissionSortField>('year');
  const [emissionOrder, setEmissionOrder] = useState<'asc' | 'desc'>('desc');
  const [emissionPage, setEmissionPage] = useState(1);
  const [emissionLimit, setEmissionLimit] = useState(25);
  const [emissions, setEmissions] = useState<PaginatedList<CountyEmissionRecord> | null>(null);
  const [emissionsLoading, setEmissionsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<CountyRecord>(`/counties/${id}`);
        setCounty(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load county.');
        setCounty(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  const loadEmissions = useCallback(async () => {
    setEmissionsLoading(true);
    try {
      const params = buildListParams({
        page: emissionPage,
        limit: emissionLimit,
        sort: emissionSort,
        order: emissionOrder,
        filters: appliedEmissions,
      });
      const result = await apiGet<PaginatedList<CountyEmissionRecord>>(`/counties/${id}/emissions?${params}`);
      setEmissions(result);
    } catch {
      setEmissions(null);
    } finally {
      setEmissionsLoading(false);
    }
  }, [appliedEmissions, emissionLimit, emissionOrder, emissionPage, emissionSort, id]);

  useEffect(() => {
    void loadEmissions();
  }, [loadEmissions]);

  const onEmissionFilter = (event: FormEvent) => {
    event.preventDefault();
    setEmissionPage(1);
    setAppliedEmissions({ q: emissionQ, year: emissionYear, sector: emissionSector });
  };

  const onClearEmissionFilters = () => {
    setEmissionQ('');
    setEmissionYear('');
    setEmissionSector('');
    setAppliedEmissions(EMPTY_EMISSION_FILTERS);
    setEmissionPage(1);
  };

  const toggleEmissionSort = (field: EmissionSortField) => {
    if (emissionSort === field) {
      setEmissionOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setEmissionSort(field);
      setEmissionOrder(field === 'year' || field === 'value' ? 'desc' : 'asc');
    }
    setEmissionPage(1);
  };

  const emissionSortIndicator = (field: string) => {
    if (emissionSort !== field) return '';
    return emissionOrder === 'asc' ? ' ↑' : ' ↓';
  };

  const hasActiveEmissionFilters = Object.values(appliedEmissions).some(Boolean);
  const status = county?.status;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Geography', href: '/admin/geography' },
            { label: 'Counties', href: '/admin/geography/counties' },
            { label: county?.name || 'County' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">{county?.name || 'County'}</h1>
        <p className="mt-2 text-[var(--muted)]">Read-only municipality catalog record.</p>
      </header>

      {loading ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {county ? (
        <>
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">IBGE</dt>
                <dd className="mt-1 font-mono text-sm">{county.IBGECode || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Code</dt>
                <dd className="mt-1 font-mono text-sm">{county.code || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Population</dt>
                <dd className="mt-1">{county.population != null ? county.population.toLocaleString() : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">State</dt>
                <dd className="mt-1">
                  <ParentLink hrefBase="/admin/geography/states" refValue={county.state} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Region</dt>
                <dd className="mt-1">
                  <ParentLink hrefBase="/admin/geography/regions" refValue={county.region} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Microregion</dt>
                <dd className="mt-1">
                  <ParentLink hrefBase="/admin/geography/microregions" refValue={county.microregion} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Biome</dt>
                <dd className="mt-1">
                  <ParentLink hrefBase="/admin/geography/biomes" refValue={county.biome} />
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Location</dt>
                <dd className="mt-1 text-sm">
                  {county.location?.lat != null || county.location?.long != null
                    ? `${county.location.lat ?? '—'}, ${county.location.long ?? '—'}`
                    : '—'}
                </dd>
              </div>
            </dl>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <YearlyTable
              title="Endangered people"
              rows={status?.endangeredPeople || []}
              extraHeader="Risk"
              extraCell={(row) => row.riskType || '—'}
            />
            <YearlyTable title="Disaster rate" rows={status?.disasterRate || []} />
            <YearlyTable title="Hidro risk" rows={status?.hidroRisk || []} />
          </div>

          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
              <h2 className="font-semibold text-[var(--foreground)]">
                Emissions
                {emissions?.pagination
                  ? ` · ${emissions.pagination.total} rows · page ${emissions.pagination.page} of ${emissions.pagination.totalPages}`
                  : ''}
                {hasActiveEmissionFilters ? ' · filters active' : ''}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span>Page size</span>
                  <select
                    value={emissionLimit}
                    onChange={(e) => {
                      setEmissionLimit(Number(e.target.value));
                      setEmissionPage(1);
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
                  columns={isAdmin ? columns : []}
                  isVisible={isAdmin ? isVisible : undefined}
                  toggle={isAdmin ? toggle : undefined}
                  showFilters={showFilters}
                  onToggleFilters={() => setShowFilters((prev) => !prev)}
                />
              </div>
            </div>
            {showFilters ? (
              <form
                onSubmit={onEmissionFilter}
                className="grid gap-3 border-b border-[var(--border)] p-4 md:grid-cols-4"
              >
                <input
                  value={emissionQ}
                  onChange={(e) => setEmissionQ(e.target.value)}
                  placeholder="Search sector, category…"
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                />
                <input
                  value={emissionYear}
                  onChange={(e) => setEmissionYear(e.target.value)}
                  placeholder="Year"
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                />
                <input
                  value={emissionSector}
                  onChange={(e) => setEmissionSector(e.target.value)}
                  placeholder="Sector"
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={onClearEmissionFilters}
                    className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]/40"
                  >
                    Clear filters
                  </button>
                </div>
              </form>
            ) : null}
            {emissionsLoading ? (
              <p className="p-4 text-sm text-[var(--muted)]">Loading emissions…</p>
            ) : !emissions?.items.length ? (
              <p className="p-4 text-sm text-[var(--muted)]">No emissions match these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                    <tr>
                      {visibleColumns.map((column) => (
                        <th key={column.id} className="px-4 py-2 font-medium">
                          <button
                            type="button"
                            onClick={() => toggleEmissionSort(column.id as EmissionSortField)}
                            className="hover:text-[var(--accent)]"
                          >
                            {column.label}
                            {emissionSortIndicator(column.id)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {emissions.items.map((row) => (
                      <tr key={row._id} className="border-b border-[var(--border)] last:border-0">
                        {visibleColumns.map((column) => (
                          <td key={column.id} className="px-4 py-2" style={{ textAlign: column.align }}>
                            {emissionCell(row, column.id)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm">
              <span className="text-[var(--muted)]">
                {emissions?.pagination
                  ? `Showing page ${emissions.pagination.page} of ${emissions.pagination.totalPages} (${emissions.pagination.total} total)`
                  : '—'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!emissions?.pagination.hasPrev || emissionsLoading}
                  onClick={() => setEmissionPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!emissions?.pagination.hasNext || emissionsLoading}
                  onClick={() => setEmissionPage((prev) => prev + 1)}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
