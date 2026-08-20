"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { Modal } from '@/components/ui/Modal';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import { AccessIconLink, TableActionRow, tableActionRowGroupClass } from '@/components/ui/TableActionIcon';
import { useAccess } from '@/components/AccessProvider';
import { useToast } from '@/components/ToastProvider';
import { apiGet, apiPost, apiPut } from '@/lib/apiUtils';
import { buildListParams, type PaginatedList } from '@/lib/listTypes';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { useAutoAppliedFilters } from '@/lib/useDebouncedValue';
import {
  PROMPT_MAX,
  SCORE_WEIGHTS,
  formatRunWhen,
  isInFlightRun,
  type AiPromptTemplate,
  type MatchMode,
  type OpportunityMatchRun,
  type OpportunityMatchRunsResponse,
} from '@/lib/opportunityMatch';
import { type FundingListResponse, type OpportunityRecord } from '@/lib/fundingTypes';
import {
  ANALYSIS_POLL_INITIAL_MS,
  nextAnalysisPollDelay,
} from '@/lib/storedFileTypes';

type PromptList = { items: AiPromptTemplate[] };
type SortField = 'createdAt' | 'updatedAt' | 'mode' | 'status' | 'candidateCount';

const DEFAULT_FILTERS = {
  q: '',
  mode: '',
  status: '',
};

const RUN_COLUMNS: ColumnDef[] = [
  { id: 'createdAt', label: 'When', alwaysVisible: true },
  { id: 'mode', label: 'Mode' },
  { id: 'status', label: 'Status' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'counties', label: 'Counties' },
  { id: 'createdBy', label: 'By' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

function opportunityNames(row: OpportunityMatchRun) {
  return (
    (row.opportunities || [])
      .map((item) => item.name)
      .filter(Boolean)
      .join(', ') || `${row.opportunityIds.length} selected`
  );
}

function createdByLabel(row: OpportunityMatchRun) {
  return row.createdBy && typeof row.createdBy === 'object'
    ? row.createdBy.username || row.createdBy.email || '—'
    : '—';
}

export default function AdminOpportunityMatchesPage() {
  const { pushToast } = useToast();
  const { isAdmin } = useAccess();
  const [prompts, setPrompts] = useState<AiPromptTemplate[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<MatchMode>('shallow');
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedList<OpportunityMatchRun> | null>(null);
  const [loading, setLoading] = useState(true);

  const { filters, setFilters, applied, page, setPage, resetFilters } = useAutoAppliedFilters(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortField>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(false);

  const columns = useMemo(() => RUN_COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('admin-opportunity-matches', columns, {
    enabled: isAdmin,
  });

  const hasActiveFilters = Object.values(applied).some(Boolean);
  const runs = data?.items || [];
  const pagination = data?.pagination;

  const loadSettings = useCallback(async () => {
    const [promptRes, oppRes] = await Promise.all([
      apiGet<PromptList>('/admin/ai-prompts'),
      apiGet<FundingListResponse<OpportunityRecord>>('/opportunities?limit=100&sort=name&order=asc'),
    ]);
    setPrompts(promptRes.items);
    setDrafts(Object.fromEntries(promptRes.items.map((item) => [item.key, item.body])));
    setActiveKey((current) => current || promptRes.items[0]?.key || '');
    setOpportunities(oppRes.items || []);
  }, []);

  const loadRuns = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const params = buildListParams({ page, limit, sort, order, filters: applied });
        const result = await apiGet<OpportunityMatchRunsResponse>(`/opportunity-matches?${params.toString()}`);
        setData({
          items: result.items || [],
          pagination: result.pagination || {
            page,
            limit,
            total: result.items?.length || 0,
            totalPages: 1,
          },
          sort: result.sort || { field: sort, order },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load match analyses.');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [applied, limit, order, page, sort]
  );

  useEffect(() => {
    void loadSettings().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load match settings.');
    });
  }, [loadSettings]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const activePrompt = prompts.find((item) => item.key === activeKey);
  const draft = drafts[activeKey] || '';
  const charCount = draft.length;
  const dirty = Boolean(activePrompt && draft !== activePrompt.body);

  const toggleOpportunity = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!activeKey) return;
    setSaving(true);
    try {
      const updated = await apiPut<PromptList>('/admin/ai-prompts', {
        items: [{ key: activeKey, body: draft }],
      });
      setPrompts(updated.items);
      setDrafts((prev) => ({
        ...prev,
        ...Object.fromEntries(updated.items.map((item) => [item.key, item.body])),
      }));
      pushToast({ tone: 'success', title: 'Prompt saved', message: activePrompt?.name || activeKey });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Could not save prompt.',
      });
    } finally {
      setSaving(false);
    }
  };

  const inFlightIds = useMemo(
    () => runs.filter((row) => isInFlightRun(row.status)).map((row) => row._id),
    [runs]
  );

  useEffect(() => {
    if (!inFlightIds.length) return undefined;
    let cancelled = false;
    let delay = ANALYSIS_POLL_INITIAL_MS;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      try {
        const nextRows = await Promise.all(
          inFlightIds.map((id) => apiGet<OpportunityMatchRun>(`/opportunity-matches/${id}`))
        );
        if (cancelled) return;
        setData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((row) => nextRows.find((item) => item._id === row._id) || row),
              }
            : prev
        );
        if (nextRows.every((row) => !isInFlightRun(row.status))) return;
      } catch {
        delay = nextAnalysisPollDelay(delay, true);
      }
      delay = nextAnalysisPollDelay(delay, false);
      timer = setTimeout(() => void tick(), delay);
    };
    timer = setTimeout(() => void tick(), delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inFlightIds.join('|')]);

  const handleStart = async () => {
    if (!selected.length) return;
    setStarting(true);
    setError(null);
    try {
      await apiPost<OpportunityMatchRun>('/opportunity-matches', {
        opportunityIds: selected,
        mode,
      });
      pushToast({
        tone: 'info',
        title: 'Analysis queued',
        message: `${mode} match for ${selected.length} opportunit${selected.length === 1 ? 'y' : 'ies'}.`,
      });
      setRunOpen(false);
      if (page === 1) await loadRuns({ silent: true });
      else setPage(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start analysis.';
      setError(message);
      pushToast({ tone: 'error', title: 'Start failed', message });
    } finally {
      setStarting(false);
    }
  };

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
      setOrder(field === 'createdAt' || field === 'updatedAt' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const sortIndicator = (field: SortField) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  const weights = useMemo(
    () =>
      Object.entries(SCORE_WEIGHTS)
        .map(([key, value]) => `${key} ${value}`)
        .join(' · '),
    []
  );

  const total = pagination?.total || 0;
  const totalPages = pagination?.totalPages || 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Opportunity matches' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mt-2 text-3xl font-semibold">Opportunity–county matching</h1>
            <p className="mt-2 text-[var(--muted)]">
              Search, filter, and review previous analyses. Edit prompts or start a new run from the
              toolbar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPromptsOpen(true)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent-soft)]/40"
            >
              Edit prompts
            </button>
            <AccessPrimaryButton allowed onClick={() => setRunOpen(true)}>
              Run analysis
            </AccessPrimaryButton>
          </div>
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
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder="Opportunity, username, or email…"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Mode</span>
            <select
              value={filters.mode}
              onChange={(event) => setFilters((prev) => ({ ...prev, mode: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="shallow">Shallow</option>
              <option value="deep">Deep</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <div className="flex items-end gap-2 md:col-span-3 lg:col-span-4">
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
              ? total === 0
                ? '0 analyses'
                : `${total} analys${total === 1 ? 'is' : 'es'} · page ${pagination.page} of ${pagination.totalPages}`
              : '—'}
            {hasActiveFilters ? ' · filters active' : ''}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span>Page size</span>
              <select
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
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
          <p className="p-5 text-[var(--muted)]">Loading analyses…</p>
        ) : runs.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No analyses match your filters.</p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)] md:hidden">
              {runs.map((row) => (
                <li key={row._id} className="space-y-3 p-4">
                  <div>
                    <p className="font-medium break-words">{opportunityNames(row)}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {formatRunWhen(row.createdAt)} · {row.mode} · {row.status}
                    </p>
                  </div>
                  <TableActionRow alwaysVisible>
                    <AccessIconLink
                      allowed
                      href={`/admin/opportunity-matches/${row._id}`}
                      icon="view"
                      label="View details"
                    />
                  </TableActionRow>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="headers-nowrap min-w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                  <tr>
                    {isVisible('createdAt') ? (
                      <th className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort('createdAt')}
                          className="hover:text-[var(--foreground)]"
                        >
                          When{sortIndicator('createdAt')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('mode') ? (
                      <th className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort('mode')}
                          className="hover:text-[var(--foreground)]"
                        >
                          Mode{sortIndicator('mode')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('status') ? (
                      <th className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort('status')}
                          className="hover:text-[var(--foreground)]"
                        >
                          Status{sortIndicator('status')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('opportunities') ? (
                      <th className="px-4 py-3 font-medium">Opportunities</th>
                    ) : null}
                    {isVisible('counties') ? (
                      <th className="px-4 py-3 font-medium">Counties</th>
                    ) : null}
                    {isVisible('createdBy') ? (
                      <th className="px-4 py-3 font-medium">By</th>
                    ) : null}
                    {isVisible('actions') ? (
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((row) => (
                    <tr
                      key={row._id}
                      className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                    >
                      {isVisible('createdAt') ? (
                        <td className="px-4 py-3 whitespace-nowrap">{formatRunWhen(row.createdAt)}</td>
                      ) : null}
                      {isVisible('mode') ? <td className="px-4 py-3">{row.mode}</td> : null}
                      {isVisible('status') ? <td className="px-4 py-3">{row.status}</td> : null}
                      {isVisible('opportunities') ? (
                        <td className="px-4 py-3">{opportunityNames(row)}</td>
                      ) : null}
                      {isVisible('counties') ? (
                        <td className="px-4 py-3 tabular-nums">{row.matches?.length || 0}</td>
                      ) : null}
                      {isVisible('createdBy') ? (
                        <td className="px-4 py-3">{createdByLabel(row)}</td>
                      ) : null}
                      {isVisible('actions') ? (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <TableActionRow>
                            <AccessIconLink
                              allowed
                              href={`/admin/opportunity-matches/${row._id}`}
                              icon="view"
                              label="View details"
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
            {total === 0 ? '0 analyses' : `Showing page ${pagination?.page || page} of ${totalPages} (${total} total)`}
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

      <Modal
        isOpen={promptsOpen}
        onClose={() => setPromptsOpen(false)}
        title="Edit prompts"
        size="xl"
        closeOnBackdrop={false}
      >
        <p className="text-sm text-[var(--muted)]">
          Instructions only (max {PROMPT_MAX} characters). County and opportunity facts are sent in a
          generated document, not in this prompt.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {prompts.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveKey(item.key)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                item.key === activeKey
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]'
                  : 'border-[var(--border)] text-[var(--muted)]'
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
        {activePrompt ? (
          <>
            <label className="mt-4 block text-sm">
              <span className="text-[var(--muted)]">
                {charCount} / {PROMPT_MAX}
                {dirty ? ' · unsaved' : ''}
              </span>
              <textarea
                value={draft}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [activeKey]: event.target.value.slice(0, PROMPT_MAX),
                  }))
                }
                rows={14}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPromptsOpen(false)}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]/40"
              >
                Close
              </button>
              <AccessPrimaryButton allowed disabled={saving || !dirty} onClick={() => void handleSave()}>
                {saving ? 'Saving…' : 'Save prompt'}
              </AccessPrimaryButton>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        isOpen={runOpen}
        onClose={() => setRunOpen(false)}
        title="Run analysis"
        size="lg"
        closeOnBackdrop={false}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Mode</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as MatchMode)}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="shallow">Shallow — one prompt per opportunity</option>
              <option value="deep">Deep — profile, then county matching</option>
            </select>
          </label>
          <p className="self-end text-sm text-[var(--muted)]">
            Score weights (0–10 each, overall 0–100): {weights}
          </p>
        </div>
        <fieldset className="mt-4">
          <legend className="text-sm text-[var(--muted)]">Opportunities</legend>
          {opportunities.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">No opportunities available.</p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] p-3">
              {opportunities.map((row) => (
                <li key={row._id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(row._id)}
                      onChange={() => toggleOpportunity(row._id)}
                    />
                    <span>
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-[var(--muted)]">{row.category}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setRunOpen(false)}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]/40"
          >
            Cancel
          </button>
          <AccessPrimaryButton
            allowed
            disabled={starting || selected.length === 0}
            onClick={() => void handleStart()}
          >
            {starting ? 'Starting…' : `Run ${mode} analysis`}
          </AccessPrimaryButton>
        </div>
      </Modal>
    </div>
  );
}
