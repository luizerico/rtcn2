"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import ColumnVisibilityMenu from '@/components/ui/ColumnVisibilityMenu';
import { useAccess } from '@/components/AccessProvider';
import { AccessIconButton, TableActionRow, tableActionRowGroupClass } from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { buildListParams, type ListPagination, type ListSort } from '@/lib/listTypes';

interface SessionRecord {
  _id: string;
  sessionId: string;
  userId: string;
  username: string;
  userAgent?: string;
  ipAddress?: string;
  clientApp?: string;
  createdAt?: string;
  expiresAt: string;
  lastSeenAt?: string;
}

interface SessionsResponse {
  sessions: SessionRecord[];
  items?: SessionRecord[];
  pagination: ListPagination;
  sort: ListSort;
  scope: 'all' | 'self';
}

type SortField = 'username' | 'clientApp' | 'ipAddress' | 'lastSeenAt' | 'expiresAt' | 'createdAt';

const SESSION_COLUMNS: ColumnDef[] = [
  { id: 'user', label: 'User', alwaysVisible: true },
  { id: 'app', label: 'App' },
  { id: 'ip', label: 'IP' },
  { id: 'lastSeen', label: 'Last seen' },
  { id: 'expires', label: 'Expires' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

const DEFAULT_FILTERS = {
  q: '',
  username: '',
  clientApp: '',
};

export default function AdminSessionsPage() {
  const { pushToast } = useToast();
  const { can, user, isAdmin } = useAccess();
  const canDisconnectOthers = can('USER:WRITE');

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortField>('lastSeenAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(false);

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [pagination, setPagination] = useState<ListPagination | null>(null);
  const [scope, setScope] = useState<'all' | 'self'>('self');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<SessionRecord | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const columns = useMemo(() => SESSION_COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('admin-sessions', columns, {
    enabled: isAdmin,
  });

  const hasActiveFilters = Object.values(applied).some(Boolean);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildListParams({ page, limit, sort, order, filters: applied });
      const data = await apiGet<SessionsResponse>(`/auth/sessions?${params.toString()}`);
      setSessions(data.sessions || data.items || []);
      setPagination(data.pagination);
      setScope(data.scope);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions.');
      setSessions([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [applied, limit, order, page, sort]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const onReset = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setSort('lastSeenAt');
    setOrder('desc');
    setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder(field === 'username' || field === 'clientApp' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const sortIndicator = (field: SortField) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  const disconnect = async () => {
    if (!pendingDisconnect) return;
    setDisconnecting(true);
    try {
      await apiDelete(`/auth/sessions/${pendingDisconnect.sessionId}`);
      pushToast({
        tone: 'success',
        title: 'Session disconnected',
        message: 'The user will need to sign in again.',
      });
      setPendingDisconnect(null);
      await loadSessions();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Disconnect failed',
        message: err instanceof Error ? err.message : 'Could not disconnect session.',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Sessions' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Active sessions</h1>
        <p className="mt-2 text-[var(--muted)]">
          Search and filter live sessions. Scope:{' '}
          <strong>{scope === 'all' ? 'all users' : 'your sessions only'}</strong>.
        </p>
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
              placeholder="User, app, IP, user agent…"
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
            <span className="text-[var(--muted)]">Client app</span>
            <input
              value={filters.clientApp}
              onChange={(e) => setFilters((prev) => ({ ...prev, clientApp: e.target.value }))}
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
                ? '0 sessions'
                : `${pagination.total} session${pagination.total === 1 ? '' : 's'} · page ${pagination.page} of ${pagination.totalPages}`
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
          <p className="p-5 text-[var(--muted)]">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No sessions match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  {isVisible('user') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('username')} className="hover:text-[var(--accent)]">
                        User{sortIndicator('username')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('app') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('clientApp')} className="hover:text-[var(--accent)]">
                        App{sortIndicator('clientApp')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('ip') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('ipAddress')} className="hover:text-[var(--accent)]">
                        IP{sortIndicator('ipAddress')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('lastSeen') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('lastSeenAt')} className="hover:text-[var(--accent)]">
                        Last seen{sortIndicator('lastSeenAt')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('expires') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('expiresAt')} className="hover:text-[var(--accent)]">
                        Expires{sortIndicator('expiresAt')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('actions') ? (
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr
                    key={session.sessionId}
                    className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                  >
                    {isVisible('user') ? (
                      <td className="px-4 py-3">
                        <div className="font-medium">{session.username}</div>
                        <div className="max-w-xs truncate text-xs text-[var(--muted)]">
                          {session.userAgent || 'Unknown agent'}
                        </div>
                      </td>
                    ) : null}
                    {isVisible('app') ? (
                      <td className="px-4 py-3">{session.clientApp || 'rbac-platform'}</td>
                    ) : null}
                    {isVisible('ip') ? (
                      <td className="px-4 py-3">{session.ipAddress || '—'}</td>
                    ) : null}
                    {isVisible('lastSeen') ? (
                      <td className="px-4 py-3">
                        {session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString() : '—'}
                      </td>
                    ) : null}
                    {isVisible('expires') ? (
                      <td className="px-4 py-3">{new Date(session.expiresAt).toLocaleString()}</td>
                    ) : null}
                    {isVisible('actions') ? (
                      <td className="px-4 py-3 text-right">
                        <TableActionRow>
                          <AccessIconButton
                            allowed={
                              canDisconnectOthers || String(session.userId) === String(user?.id)
                            }
                            icon="disconnect"
                            label="Disconnect"
                            danger
                            onClick={() => setPendingDisconnect(session)}
                            reason="You can only disconnect your own sessions."
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
                ? '0 sessions'
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

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDisconnect)}
        onClose={() => setPendingDisconnect(null)}
        onConfirm={disconnect}
        title="Disconnect session"
        description={
          pendingDisconnect
            ? `Disconnect session for ${pendingDisconnect.username}? They will need to sign in again.`
            : undefined
        }
        confirmLabel="Disconnect"
        busy={disconnecting}
      />
    </div>
  );
}
