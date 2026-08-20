"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import { useAccess } from '@/components/AccessProvider';
import {
  AccessIconButton,
  AccessIconLink,
  TableActionRow,
  tableActionRowGroupClass,
} from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { useAutoAppliedFilters } from '@/lib/useDebouncedValue';

interface SurveyRecord {
  _id: string;
  name: string;
  description?: string;
  questionCount?: number;
  createdAt?: string;
  updatedAt?: string;
  ownerId?: { username?: string; email?: string } | string;
  createdBy?: { username?: string; email?: string } | string;
}

interface SurveyListResponse {
  items: SurveyRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  sort: string;
  order: 'asc' | 'desc';
  search: string;
  filters: { createdBy: string | null };
}

type SortField = 'name' | 'createdAt' | 'updatedAt' | 'questionCount';

const SURVEY_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', alwaysVisible: true },
  { id: 'questions', label: 'Questions' },
  { id: 'owner', label: 'Owner' },
  { id: 'updated', label: 'Updated' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

function surveyOwnerName(survey: SurveyRecord): string {
  const pick = (value: SurveyRecord['ownerId']) => {
    if (value && typeof value === 'object') {
      return value.username || value.email || null;
    }
    return null;
  };
  return pick(survey.ownerId) || pick(survey.createdBy) || '—';
}

export default function SurveysPage() {
  const { pushToast } = useToast();
  const { can, isAdmin } = useAccess();
  const canCreate = can('SURVEY:CREATE', { classWideOnly: true });
  const columns = useMemo(() => SURVEY_COLUMNS, []);
  const { isVisible, toggle: toggleColumn } = useColumnVisibility('surveys', columns, {
    enabled: isAdmin,
  });
  const [pendingDelete, setPendingDelete] = useState<SurveyRecord | null>(null);
  const [pendingLinks, setPendingLinks] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [data, setData] = useState<SurveyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, setFilters, applied, page, setPage, resetFilters } = useAutoAppliedFilters({
    search: '',
    createdBy: '',
  });
  const search = applied.search;
  const createdBy = applied.createdBy;
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<SortField>('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const loadSurveys = useCallback(async () => {
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
      if (createdBy) params.set('createdBy', createdBy);

      const response = await apiGet<SurveyListResponse>(`/surveys?${params.toString()}`);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load surveys.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, limit, sort, order, search, createdBy]);

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  const toggleSort = (field: SortField) => {
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
      await apiDelete(`/surveys/${pendingDelete._id}`);
      pushToast({
        tone: 'info',
        title: 'Survey moved to recycle bin',
        message: 'The survey can be restored from Recycle bin.',
      });
      setPendingDelete(null);
      setPendingLinks(0);
      await loadSurveys();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Could not delete survey.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const requestDelete = async (survey: SurveyRecord) => {
    setPendingDelete(survey);
    try {
      const links = await apiGet<{ count: number }>(`/surveys/${survey._id}/localplan-links`);
      setPendingLinks(links.count || 0);
    } catch {
      setPendingLinks(0);
    }
  };

  const sortMark = (field: SortField) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  const items = data?.items || [];
  const totalPages = data?.totalPages || 0;
  const total = data?.total || 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Surveys' }]} />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Survey instruments</h1>
            <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
              Design and publish versioned instruments. Assign counties here; filling happens in Surveys.
            </p>
          </div>
          {canCreate ? (
            <Link
              href="/admin/surveys/new"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
            >
              Create survey
            </Link>
          ) : null}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      {showFilters ? (
        <form
          onSubmit={(event) => event.preventDefault()}
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Search</span>
            <input
              id="survey-search"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Name or description"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Created by (user id)</span>
            <input
              id="survey-created-by"
              value={filters.createdBy}
              onChange={(e) => setFilters((prev) => ({ ...prev, createdBy: e.target.value }))}
              placeholder="Optional filter"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                resetFilters({ search: '', createdBy: '' });
                setSort('updatedAt');
                setOrder('desc');
              }}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]/40"
            >
              Reset
            </button>
          </div>
        </form>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>
            {total === 0 ? '0 surveys' : `${total} survey${total === 1 ? '' : 's'} · page ${page} of ${totalPages || 1}`}
            {search || createdBy ? ' · filters active' : ''}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span>Page size</span>
              <select
                id="survey-limit"
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
              toggle={isAdmin ? toggleColumn : undefined}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters((prev) => !prev)}
            />
          </div>
        </div>

        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading surveys…</p>
        ) : items.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No surveys match your filters.</p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)] md:hidden">
              {items.map((survey) => (
                <li key={survey._id} className="space-y-3 p-4">
                  <div>
                    <p className="font-medium break-words">{survey.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {survey.description || '—'}
                    </p>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {survey.questionCount ?? 0} questions · Owner: {surveyOwnerName(survey)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Updated{' '}
                      {survey.updatedAt ? new Date(survey.updatedAt).toLocaleString() : '—'}
                    </p>
                  </div>
                  <TableActionRow alwaysVisible>
                    <AccessIconLink
                      allowed={can('SURVEY:READ', { resourceId: survey._id })}
                      href={`/admin/surveys/${survey._id}`}
                      icon="edit"
                      label="Design"
                    />
                    <AccessIconLink
                      allowed={can('SURVEY:READ', { resourceId: survey._id })}
                      href={`/admin/surveys/${survey._id}/counties`}
                      icon="counties"
                      label="Assign counties"
                    />
                    <AccessIconLink
                      allowed={can('SURVEY:READ', { resourceId: survey._id })}
                      href={`/surveys/${survey._id}/responses`}
                      icon="results"
                      label="Sheets"
                    />
                    <AccessIconButton
                      allowed={can('SURVEY:DELETE', { resourceId: survey._id })}
                      icon="delete"
                      label="Delete"
                      danger
                      onClick={() => void requestDelete(survey)}
                    />
                  </TableActionRow>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="headers-nowrap min-w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                  <tr>
                    {isVisible('name') ? (
                      <th className="px-4 py-3 font-medium">
                        <button type="button" onClick={() => toggleSort('name')} className="hover:text-[var(--foreground)]">
                          Name{sortMark('name')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('questions') ? (
                      <th className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort('questionCount')}
                          className="hover:text-[var(--foreground)]"
                        >
                          Questions{sortMark('questionCount')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('owner') ? <th className="px-4 py-3 font-medium">Owner</th> : null}
                    {isVisible('updated') ? (
                      <th className="hidden px-4 py-3 font-medium lg:table-cell">
                        <button
                          type="button"
                          onClick={() => toggleSort('updatedAt')}
                          className="hover:text-[var(--foreground)]"
                        >
                          Updated{sortMark('updatedAt')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('actions') ? (
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((survey) => (
                    <tr
                      key={survey._id}
                      className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                    >
                      {isVisible('name') ? (
                        <td className="px-4 py-3">
                          <div className="font-medium">{survey.name}</div>
                          <div className="text-xs text-[var(--muted)]">{survey.description || '—'}</div>
                        </td>
                      ) : null}
                      {isVisible('questions') ? (
                        <td className="px-4 py-3">{survey.questionCount ?? 0}</td>
                      ) : null}
                      {isVisible('owner') ? (
                        <td className="px-4 py-3">{surveyOwnerName(survey)}</td>
                      ) : null}
                      {isVisible('updated') ? (
                        <td className="hidden px-4 py-3 lg:table-cell">
                          {survey.updatedAt ? new Date(survey.updatedAt).toLocaleString() : '—'}
                        </td>
                      ) : null}
                      {isVisible('actions') ? (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <TableActionRow>
                            <AccessIconLink
                              allowed={can('SURVEY:READ', { resourceId: survey._id })}
                              href={`/admin/surveys/${survey._id}`}
                              icon="edit"
                              label="Design"
                            />
                            <AccessIconLink
                              allowed={can('SURVEY:READ', { resourceId: survey._id })}
                              href={`/admin/surveys/${survey._id}/counties`}
                              icon="counties"
                              label="Assign counties"
                            />
                            <AccessIconLink
                              allowed={can('SURVEY:READ', { resourceId: survey._id })}
                              href={`/surveys/${survey._id}/responses`}
                              icon="results"
                              label="Sheets"
                            />
                            <AccessIconButton
                              allowed={can('SURVEY:DELETE', { resourceId: survey._id })}
                              icon="delete"
                              label="Delete"
                              danger
                              onClick={() => void requestDelete(survey)}
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
              ? '0 surveys'
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
        onClose={() => {
          setPendingDelete(null);
          setPendingLinks(0);
        }}
        onConfirm={handleDelete}
        title="Move to recycle bin"
        itemLabel={pendingDelete?.name}
        description={
          pendingDelete
            ? pendingLinks > 0
              ? `Move “${pendingDelete.name}” to the recycle bin? ${pendingLinks} linked local plan${
                  pendingLinks === 1 ? '' : 's'
                } will remain until deleted separately. Permanent survey purge will be blocked while they exist.`
              : `Move “${pendingDelete.name}” to the recycle bin? An administrator can restore it later.`
            : undefined
        }
        confirmLabel="Move to bin"
        busy={deleting}
      />
    </div>
  );
}
