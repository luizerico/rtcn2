"use client";

import { FormEvent, Fragment, useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

interface ActionLogRecord {
  _id: string;
  userId?: string | null;
  username?: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  success: boolean;
  message?: string;
  ipAddress?: string;
  userAgent?: string;
  clientApp?: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

interface LogsResponse {
  items: ActionLogRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPrev?: boolean;
    hasNext?: boolean;
  };
  sort: { field: string; order: 'asc' | 'desc' };
}

interface FilterOptions {
  actions: string[];
  resourceTypes: string[];
  sortableFields: string[];
}

type SortField = 'createdAt' | 'username' | 'action' | 'resourceType' | 'method' | 'statusCode' | 'success';

const DEFAULT_FILTERS = {
  q: '',
  username: '',
  action: '',
  resourceType: '',
  method: '',
  statusCode: '',
  success: '',
  from: '',
  to: '',
};

export default function AdminLogsPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortField>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    actions: [],
    resourceTypes: [],
    sortableFields: [],
  });
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = Object.values(applied).some(Boolean);

  const loadFilterOptions = useCallback(async () => {
    try {
      const options = await apiGet<FilterOptions>('/logs/filters');
      setFilterOptions(options);
    } catch {
      // Non-fatal: dropdowns stay empty until logs exist.
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      params.set('sort', sort);
      params.set('order', order);

      for (const [key, value] of Object.entries(applied)) {
        if (value) params.set(key, value);
      }

      const result = await apiGet<LogsResponse>(`/logs?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load action logs.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [applied, limit, order, page, sort]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

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
      setOrder(field === 'createdAt' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const sortIndicator = (field: SortField) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  const pagination = data?.pagination;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Logs' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Action logs</h1>
        <p className="mt-2 text-[var(--muted)]">
          Search, filter, and order user actions stored in MongoDB. Filtering runs on the API.
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
              placeholder="Username, action, path, message…"
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
            <span className="text-[var(--muted)]">Action</span>
            <select
              value={filters.action}
              onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {filterOptions.actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Resource</span>
            <select
              value={filters.resourceType}
              onChange={(e) => setFilters((prev) => ({ ...prev, resourceType: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {filterOptions.resourceTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Method</span>
            <select
              value={filters.method}
              onChange={(e) => setFilters((prev) => ({ ...prev, method: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {['POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Status</span>
            <input
              value={filters.statusCode}
              onChange={(e) => setFilters((prev) => ({ ...prev, statusCode: e.target.value }))}
              placeholder="200"
              inputMode="numeric"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Result</span>
            <select
              value={filters.success}
              onChange={(e) => setFilters((prev) => ({ ...prev, success: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="true">Success</option>
              <option value="false">Failure</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">From</span>
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">To</span>
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
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
                ? '0 logs'
                : `${pagination.total} log${pagination.total === 1 ? '' : 's'} · page ${pagination.page} of ${pagination.totalPages}`
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
          </div>
        </div>

        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading logs…</p>
        ) : !data || data.items.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No action logs match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  {(
                    [
                      ['createdAt', 'When'],
                      ['username', 'User'],
                      ['action', 'Action'],
                      ['resourceType', 'Resource'],
                      ['method', 'Method'],
                      ['statusCode', 'Status'],
                    ] as [SortField, string][]
                  ).map(([field, label]) => (
                    <th key={field} className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort(field)}
                        className="hover:text-[var(--accent)]"
                      >
                        {label}
                        {sortIndicator(field)}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((log) => (
                  <Fragment key={log._id}>
                    <tr className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent-soft)]/20">
                      <td className="whitespace-nowrap px-4 py-3">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{log.username || '—'}</div>
                        {log.ipAddress ? (
                          <div className="text-xs text-[var(--muted)]">{log.ipAddress}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                      <td className="px-4 py-3">
                        <div>{log.resourceType}</div>
                        {log.resourceId ? (
                          <div className="max-w-[8rem] truncate text-xs text-[var(--muted)]">
                            {log.resourceId}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{log.method}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            log.success ? 'text-teal-800' : 'font-medium text-[var(--danger)]'
                          }
                        >
                          {log.statusCode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId((prev) => (prev === log._id ? null : log._id))
                          }
                          className="max-w-xs truncate text-left hover:underline"
                          title={log.path}
                        >
                          {log.path}
                        </button>
                      </td>
                    </tr>
                    {expandedId === log._id ? (
                      <tr className="border-b border-[var(--border)] bg-slate-50/80">
                        <td colSpan={7} className="px-4 py-3 text-xs text-[var(--muted)]">
                          <p className="mb-2 text-sm text-slate-700">{log.message}</p>
                          <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-white p-3">
                            {JSON.stringify(
                              {
                                userAgent: log.userAgent,
                                clientApp: log.clientApp,
                                meta: log.meta,
                              },
                              null,
                              2
                            )}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[var(--muted)]">
            {pagination
              ? pagination.total === 0
                ? '0 logs'
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
