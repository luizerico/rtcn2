"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import ColumnVisibilityMenu from '@/components/ui/ColumnVisibilityMenu';
import { useAccess } from '@/components/AccessProvider';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import {
  AccessIconButton,
  AccessIconLink,
  TableActionRow,
  tableActionRowGroupClass,
} from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';

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
  const canViewResults = isAdmin;
  const columns = useMemo(() => SURVEY_COLUMNS, []);
  const { isVisible, toggle: toggleColumn } = useColumnVisibility('surveys', columns, {
    enabled: isAdmin,
  });
  const [pendingDelete, setPendingDelete] = useState<SurveyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [data, setData] = useState<SurveyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [createdByInput, setCreatedByInput] = useState('');
  const [search, setSearch] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
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

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setCreatedBy(createdByInput.trim());
  };

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
      pushToast({ tone: 'info', title: 'Survey deleted', message: 'Survey and responses removed.' });
      setPendingDelete(null);
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
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Surveys' }]} />
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Surveys</h1>
        <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
          Browse, search, and manage surveys. Create new surveys from the table toolbar.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 lg:flex-row lg:items-end lg:justify-between">
          <form onSubmit={handleSearch} className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="survey-search">
                Search
              </label>
              <input
                id="survey-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Name or description"
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:w-48">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="survey-created-by">
                Created by (user id)
              </label>
              <input
                id="survey-created-by"
                value={createdByInput}
                onChange={(e) => setCreatedByInput(e.target.value)}
                placeholder="Optional filter"
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:w-28">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="survey-limit">
                Page size
              </label>
              <select
                id="survey-limit"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              >
                {[5, 10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
            >
              Apply
            </button>
          </form>

          {canCreate ? (
            <Link
              href="/surveys/new"
              className="inline-flex w-full items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] sm:w-auto"
            >
              Create survey
            </Link>
          ) : (
            <AccessPrimaryButton allowed={false} className="w-full sm:w-auto">
              Create survey
            </AccessPrimaryButton>
          )}
          {isAdmin ? (
            <ColumnVisibilityMenu
              columns={columns}
              isVisible={isVisible}
              toggle={toggleColumn}
            />
          ) : null}
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
                      href={`/surveys/${survey._id}`}
                      icon="answer"
                      label="Answer"
                    />
                    <AccessIconLink
                      allowed={canViewResults}
                      href={`/surveys/${survey._id}/responses`}
                      icon="results"
                      label="Results"
                    />
                    <AccessIconButton
                      allowed={can('SURVEY:DELETE', { resourceId: survey._id })}
                      icon="delete"
                      label="Delete"
                      danger
                      onClick={() => setPendingDelete(survey)}
                    />
                  </TableActionRow>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
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
                              href={`/surveys/${survey._id}`}
                              icon="answer"
                              label="Answer"
                            />
                            <AccessIconLink
                              allowed={canViewResults}
                              href={`/surveys/${survey._id}/responses`}
                              icon="results"
                              label="Results"
                            />
                            <AccessIconButton
                              allowed={can('SURVEY:DELETE', { resourceId: survey._id })}
                              icon="delete"
                              label="Delete"
                              danger
                              onClick={() => setPendingDelete(survey)}
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
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        itemLabel={pendingDelete?.name}
        busy={deleting}
      />
    </div>
  );
}
