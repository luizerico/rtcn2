"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import { useAccess } from '@/components/AccessProvider';
import { useToast } from '@/components/ToastProvider';
import AnswerSurveyModal from '@/components/surveys/AnswerSurveyModal';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import {
  AccessIconButton,
  AccessIconLink,
  TableActionRow,
  tableActionRowGroupClass,
} from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';

type AnswerRow = {
  _id: string;
  instrumentId: string;
  surveyName: string;
  instrumentType?: string;
  subjectType: string;
  subjectId: string;
  subjectLabel?: string;
  status: string;
  revision: number;
  updatedAt?: string;
  ownerId?: string | null;
  computedScore?: { letter?: string; percent?: number };
};

type SortField = 'surveyName' | 'subjectLabel' | 'status' | 'grade' | 'updatedAt';

const COLUMNS: ColumnDef[] = [
  { id: 'survey', label: 'Survey', alwaysVisible: true },
  { id: 'subject', label: 'Subject' },
  { id: 'status', label: 'Status' },
  { id: 'grade', label: 'Grade' },
  { id: 'updated', label: 'Updated' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

const DEFAULT_FILTERS = {
  q: '',
  status: '',
  subjectType: '',
};

function canEditSheet(
  row: AnswerRow,
  opts: { can: (perm: string, options?: { resourceId?: string }) => boolean; isAdmin: boolean; userId?: string }
) {
  if (opts.isAdmin) return true;
  if (row.status === 'archived') return false;
  if (opts.can(`${row.subjectType}:WRITE`, { resourceId: row.subjectId })) return true;
  const ownerEditable = row.status === 'in_progress' || row.status === 'need_changes';
  return ownerEditable && Boolean(opts.userId) && row.ownerId === opts.userId;
}

function canDeleteSheet(
  row: AnswerRow,
  opts: { can: (perm: string, options?: { resourceId?: string }) => boolean; isAdmin: boolean; userId?: string }
) {
  if (opts.isAdmin) return true;
  if (opts.can(`${row.subjectType}:DELETE`, { resourceId: row.subjectId })) return true;
  const ownerEditable = row.status === 'in_progress' || row.status === 'need_changes';
  return ownerEditable && Boolean(opts.userId) && row.ownerId === opts.userId;
}

function formatStatus(value: string) {
  return value.replaceAll('_', ' ');
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

export default function SurveyAnswersWorkspacePage() {
  const { can, isAdmin, user } = useAccess();
  const { pushToast } = useToast();
  const [items, setItems] = useState<AnswerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AnswerRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canStart = can('SURVEY:READ', { allowAnyInstance: true });

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortField>('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(false);

  const columns = useMemo(() => COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('survey-answers', columns);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items: AnswerRow[] }>('/surveys/answers');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load answers.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOptions = useMemo(
    () => [...new Set(items.map((row) => row.status))].sort(),
    [items]
  );
  const subjectTypeOptions = useMemo(
    () => [...new Set(items.map((row) => row.subjectType))].sort(),
    [items]
  );

  const filtered = useMemo(() => {
    const query = applied.q.trim().toLowerCase();
    const next = items.filter((row) => {
      if (applied.status && row.status !== applied.status) return false;
      if (applied.subjectType && row.subjectType !== applied.subjectType) return false;
      if (!query) return true;
      const haystack = [row.surveyName, row.subjectLabel, row.subjectType, row.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    next.sort((left, right) => {
      let result = 0;
      if (sort === 'surveyName') result = compareText(left.surveyName, right.surveyName);
      else if (sort === 'subjectLabel') {
        result = compareText(left.subjectLabel || left.subjectId, right.subjectLabel || right.subjectId);
      } else if (sort === 'status') result = compareText(left.status, right.status);
      else if (sort === 'grade') {
        result = (left.computedScore?.percent || 0) - (right.computedScore?.percent || 0);
      } else {
        result = new Date(left.updatedAt || 0).getTime() - new Date(right.updatedAt || 0).getTime();
      }
      return order === 'asc' ? result : -result;
    });
    return next;
  }, [applied, items, order, sort]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * limit, currentPage * limit);
  const hasActiveFilters = Object.values(applied).some(Boolean);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const onReset = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setSort('updatedAt');
    setOrder('desc');
    setPage(1);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(
        `/surveys/${pendingDelete.instrumentId}/subjects/${pendingDelete.subjectType}/${pendingDelete.subjectId}`
      );
      pushToast({
        tone: 'info',
        title: 'Answer moved to recycle bin',
        message: 'An administrator can restore it from Recycle bin.',
      });
      setPendingDelete(null);
      await load();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Could not delete this answer.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder(field === 'updatedAt' || field === 'grade' ? 'desc' : 'asc');
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
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Surveys' }]} />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Surveys</h1>
            <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
              Sheets you can read. Start a new answer, then save a draft or mark it complete.
            </p>
          </div>
          {canStart ? (
            <button
              type="button"
              onClick={() => setAnswerOpen(true)}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
            >
              Answer a survey
            </button>
          ) : null}
        </div>
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
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder="Survey or subject…"
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
              {statusOptions.map((value) => (
                <option key={value} value={value}>
                  {formatStatus(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Subject type</span>
            <select
              value={filters.subjectType}
              onChange={(event) => setFilters((prev) => ({ ...prev, subjectType: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {subjectTypeOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 md:col-span-3 lg:col-span-4">
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
            {loading
              ? '—'
              : total === 0
                ? '0 sheets'
                : `${total} sheet${total === 1 ? '' : 's'} · page ${currentPage} of ${totalPages}`}
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
              columns={columns}
              isVisible={isVisible}
              toggle={toggle}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters((prev) => !prev)}
            />
          </div>
        </div>

        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading answers…</p>
        ) : pageRows.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">
            {items.length === 0 ? 'No answered surveys yet.' : 'No sheets match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  {isVisible('survey') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('surveyName')} className="hover:text-[var(--accent)]">
                        Survey{sortIndicator('surveyName')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('subject') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('subjectLabel')} className="hover:text-[var(--accent)]">
                        Subject{sortIndicator('subjectLabel')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('status') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('status')} className="hover:text-[var(--accent)]">
                        Status{sortIndicator('status')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('grade') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('grade')} className="hover:text-[var(--accent)]">
                        Grade{sortIndicator('grade')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('updated') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('updatedAt')} className="hover:text-[var(--accent)]">
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
                {pageRows.map((row) => {
                  const href = `/surveys/${row.instrumentId}/subjects/${row.subjectType}/${row.subjectId}`;
                  const accessOpts = { can, isAdmin, userId: user?.id };
                  const editable = canEditSheet(row, accessOpts);
                  const deletable = canDeleteSheet(row, accessOpts);
                  const score = row.computedScore;
                  return (
                    <tr
                      key={row._id}
                      className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                    >
                      {isVisible('survey') ? (
                        <td className="px-4 py-3 font-medium">{row.surveyName}</td>
                      ) : null}
                      {isVisible('subject') ? (
                        <td className="px-4 py-3">
                          {row.subjectLabel || row.subjectId}
                          <span className="block text-xs text-[var(--muted)]">{row.subjectType}</span>
                        </td>
                      ) : null}
                      {isVisible('status') ? (
                        <td className="whitespace-nowrap px-4 py-3">{formatStatus(row.status)}</td>
                      ) : null}
                      {isVisible('grade') ? (
                        <td className="whitespace-nowrap px-4 py-3">
                          {score?.letter ? `${score.letter} (${score.percent ?? 0}%)` : '—'}
                        </td>
                      ) : null}
                      {isVisible('updated') ? (
                        <td className="whitespace-nowrap px-4 py-3">
                          {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}
                        </td>
                      ) : null}
                      {isVisible('actions') ? (
                        <td className="px-4 py-3 text-right">
                          <TableActionRow>
                            <AccessIconLink
                              allowed
                              href={`${href}/view`}
                              icon="view"
                              label="View"
                            />
                            <AccessIconLink
                              allowed={editable}
                              href={href}
                              icon="edit"
                              label="Edit"
                              reason="You cannot edit this sheet."
                            />
                            <AccessIconButton
                              allowed={deletable}
                              icon="delete"
                              label="Delete"
                              danger
                              reason="You cannot delete this sheet."
                              onClick={() => setPendingDelete(row)}
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
            {loading
              ? '—'
              : total === 0
                ? '0 sheets'
                : `Showing page ${currentPage} of ${totalPages} (${total} total)`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <AnswerSurveyModal isOpen={answerOpen} onClose={() => setAnswerOpen(false)} />

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title="Move to recycle bin"
        itemLabel={
          pendingDelete
            ? `${pendingDelete.surveyName} · ${pendingDelete.subjectLabel || pendingDelete.subjectId}`
            : undefined
        }
        description={
          pendingDelete
            ? `Move the “${pendingDelete.surveyName}” sheet for ${pendingDelete.subjectLabel || pendingDelete.subjectId} to the recycle bin? An administrator can restore it later.`
            : undefined
        }
        confirmLabel="Move to bin"
        busy={deleting}
      />
    </div>
  );
}
