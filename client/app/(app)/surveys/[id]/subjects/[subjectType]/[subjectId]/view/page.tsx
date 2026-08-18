"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import AnswersAreaTree from '@/components/surveys/AnswersAreaTree';
import QuestionFilesModal from '@/components/surveys/QuestionFilesModal';
import QuestionNotesModal from '@/components/surveys/QuestionNotesModal';
import {
  AccessIconButton,
  TableActionRow,
  tableActionRowGroupClass,
} from '@/components/ui/TableActionIcon';
import { formatScore, type SurveyScore } from '@/lib/surveyScore';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import type { StoredFileRecord } from '@/lib/storedFileTypes';

type QuestionType = 'score' | 'text' | 'multiple_choice' | 'yes_no';
type AnswerSortField = 'index' | 'code' | 'area' | 'type' | 'answer';
type RevisionSortField = 'revision' | 'status' | 'score' | 'createdAt';
type AnswersViewMode = 'table' | 'tree';

interface VersionQuestion {
  questionId: string;
  code?: string;
  area?: string;
  prompt: string;
  type: QuestionType;
  evidence?: string;
  maxPoints?: number;
  weight?: number;
}

type Score = SurveyScore;

interface SheetPayload {
  _id?: string;
  surveyName?: string;
  subjectLabel?: string;
  version?: number;
  subjectType: string;
  subjectId: string;
  status: string;
  answers: Array<{ questionId: string; value: string | number; obs?: string }>;
  revision: number;
  computedScore?: Score;
  canEdit?: boolean;
  questions: VersionQuestion[];
}

interface RevisionRow {
  _id: string;
  revision: number;
  createdAt?: string;
  snapshot?: {
    status?: string;
    computedScore?: Score;
  };
}

const ANSWER_COLUMNS: ColumnDef[] = [
  { id: 'index', label: '#', defaultVisible: false },
  { id: 'code', label: 'Code' },
  { id: 'area', label: 'Area' },
  { id: 'prompt', label: 'Question', alwaysVisible: true },
  { id: 'type', label: 'Type' },
  { id: 'answer', label: 'Answer' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

const REVISION_COLUMNS: ColumnDef[] = [
  { id: 'revision', label: 'Revision', alwaysVisible: true },
  { id: 'status', label: 'Status' },
  { id: 'score', label: 'Score' },
  { id: 'createdAt', label: 'Saved' },
];

const DEFAULT_FILTERS = {
  q: '',
  area: '',
  type: '',
  answered: '',
  notes: '',
  files: '',
};

const VIEW_MODE_STORAGE_KEY = 'sheet_answers_view_mode_v1';

function readAnswersViewMode(): AnswersViewMode {
  if (typeof window === 'undefined') return 'table';
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'tree' ? 'tree' : 'table';
  } catch {
    return 'table';
  }
}

function formatStatus(value?: string) {
  return (value || '—').replaceAll('_', ' ');
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

export default function SheetAnswersViewPage() {
  const params = useParams<{ id: string; subjectType: string; subjectId: string }>();
  const surveyId = params.id;
  const subjectType = String(params.subjectType || '').toUpperCase();
  const subjectId = params.subjectId;
  const basePath = `/surveys/${surveyId}/subjects/${subjectType}/${subjectId}`;

  const [sheet, setSheet] = useState<SheetPayload | null>(null);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [files, setFiles] = useState<StoredFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notesQuestionId, setNotesQuestionId] = useState<string | null>(null);
  const [filesQuestionId, setFilesQuestionId] = useState<string | null>(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState<AnswerSortField>('code');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(false);

  const [revisionSort, setRevisionSort] = useState<RevisionSortField>('revision');
  const [revisionOrder, setRevisionOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<AnswersViewMode>('table');

  const answerColumns = useMemo(() => ANSWER_COLUMNS, []);
  const revisionColumns = useMemo(() => REVISION_COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('sheet-answers-view', answerColumns);
  const {
    isVisible: isRevisionVisible,
    toggle: toggleRevisionColumn,
  } = useColumnVisibility('sheet-revisions-view', revisionColumns);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<SheetPayload>(basePath);
      setSheet(data);
      if (data._id) {
        const [history, listed] = await Promise.all([
          apiGet<{ items: RevisionRow[] }>(`${basePath}/revisions`),
          apiGet<{ items: StoredFileRecord[] }>(`${basePath}/files`),
        ]);
        setRevisions(history.items || []);
        setFiles(listed.items || []);
      } else {
        setRevisions([]);
        setFiles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sheet.');
      setSheet(null);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setViewMode(readAnswersViewMode());
  }, []);

  const persistViewMode = (mode: AnswersViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore quota / private mode
    }
  };

  const answersByQuestion = useMemo(() => {
    return new Map((sheet?.answers || []).map((row) => [String(row.questionId), row]));
  }, [sheet?.answers]);

  const fileCountByQuestion = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const file of files) {
      const questionId = file.questionId || '';
      if (!questionId) continue;
      counts[questionId] = (counts[questionId] || 0) + 1;
    }
    return counts;
  }, [files]);

  const areaOptions = useMemo(() => {
    return [
      ...new Set(
        (sheet?.questions || [])
          .map((row) => row.area)
          .filter((area): area is string => Boolean(area))
      ),
    ].sort();
  }, [sheet?.questions]);

  const typeOptions = useMemo(() => {
    return [...new Set((sheet?.questions || []).map((row) => row.type))].sort();
  }, [sheet?.questions]);

  const rows = useMemo(() => {
    return (sheet?.questions || []).map((question, index) => {
      const answer = answersByQuestion.get(question.questionId);
      const value = answer?.value == null || answer.value === '' ? '' : String(answer.value);
      const notes = answer?.obs || '';
      return {
        index,
        question,
        value,
        notes,
        fileCount: fileCountByQuestion[question.questionId] || 0,
      };
    });
  }, [answersByQuestion, fileCountByQuestion, sheet?.questions]);

  const filteredRows = useMemo(() => {
    const query = applied.q.trim().toLowerCase();
    const next = rows.filter((row) => {
      if (applied.area && row.question.area !== applied.area) return false;
      if (applied.type && row.question.type !== applied.type) return false;
      if (applied.answered === 'yes' && !row.value) return false;
      if (applied.answered === 'no' && row.value) return false;
      if (applied.notes === 'yes' && !row.notes.trim()) return false;
      if (applied.notes === 'no' && row.notes.trim()) return false;
      if (applied.files === 'yes' && row.fileCount === 0) return false;
      if (applied.files === 'no' && row.fileCount > 0) return false;
      if (!query) return true;
      const haystack = [
        row.question.code,
        row.question.area,
        row.question.prompt,
        row.value,
        row.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });

    next.sort((left, right) => {
      let result = 0;
      if (sort === 'index') result = left.index - right.index;
      else if (sort === 'code') result = compareText(left.question.code || '', right.question.code || '');
      else if (sort === 'area') result = compareText(left.question.area || '', right.question.area || '');
      else if (sort === 'type') result = compareText(left.question.type, right.question.type);
      else result = compareText(left.value, right.value);
      if (result === 0) result = left.index - right.index;
      return order === 'asc' ? result : -result;
    });
    return next;
  }, [applied, order, rows, sort]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * limit, currentPage * limit);
  const hasActiveFilters = Object.values(applied).some(Boolean);

  const sortedRevisions = useMemo(() => {
    const next = [...revisions];
    next.sort((left, right) => {
      let result = 0;
      if (revisionSort === 'revision') result = left.revision - right.revision;
      else if (revisionSort === 'status') {
        result = compareText(left.snapshot?.status || '', right.snapshot?.status || '');
      } else if (revisionSort === 'score') {
        result = (left.snapshot?.computedScore?.percent || 0) - (right.snapshot?.computedScore?.percent || 0);
      } else {
        result = new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
      }
      return revisionOrder === 'asc' ? result : -result;
    });
    return next;
  }, [revisionOrder, revisionSort, revisions]);

  const notesQuestion = sheet?.questions.find((question) => question.questionId === notesQuestionId) || null;
  const filesQuestion = sheet?.questions.find((question) => question.questionId === filesQuestionId) || null;
  const notesValue = notesQuestion
    ? answersByQuestion.get(notesQuestion.questionId)?.obs || ''
    : '';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const onReset = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setSort('code');
    setOrder('asc');
    setPage(1);
  };

  const toggleSort = (field: AnswerSortField) => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder('asc');
    }
    setPage(1);
  };

  const toggleRevisionSort = (field: RevisionSortField) => {
    if (revisionSort === field) {
      setRevisionOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setRevisionSort(field);
      setRevisionOrder(field === 'revision' || field === 'createdAt' || field === 'score' ? 'desc' : 'asc');
    }
  };

  const sortIndicator = (field: AnswerSortField) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  const revisionSortIndicator = (field: RevisionSortField) => {
    if (revisionSort !== field) return '';
    return revisionOrder === 'asc' ? ' ↑' : ' ↓';
  };

  if (loading) return <p className="text-[var(--muted)]">Loading answers…</p>;
  if (error || !sheet) {
    return (
      <div className="space-y-3">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Surveys', href: '/surveys' },
            { label: 'View' },
          ]}
        />
        <p className="text-red-700">{error || 'Sheet not found.'}</p>
      </div>
    );
  }

  const score = sheet.computedScore;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Surveys', href: '/surveys' },
            { label: 'View answers' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">{sheet.surveyName || 'Instrument sheet'}</h1>
            <p className="mt-2 text-[var(--muted)]">
              {sheet.subjectLabel || subjectId} · {subjectType} · version {sheet.version ?? '—'} ·
              revision {sheet.revision || 0} · {formatStatus(sheet.status)}
              {score ? ` · ${formatScore(score)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {revisions.length >= 2 ? (
              <Link
                href={`${basePath}/compare`}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
              >
                Compare revisions
              </Link>
            ) : null}
            {sheet.canEdit ? (
              <Link
                href={basePath}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
              >
                Edit sheet
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {viewMode === 'table' && showFilters ? (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Search</span>
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder="Question, code, answer, or notes…"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Area</span>
            <select
              value={filters.area}
              onChange={(event) => setFilters((prev) => ({ ...prev, area: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {areaOptions.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Type</span>
            <select
              value={filters.type}
              onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Answered</span>
            <select
              value={filters.answered}
              onChange={(event) => setFilters((prev) => ({ ...prev, answered: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="yes">Answered</option>
              <option value="no">Unanswered</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Notes</span>
            <select
              value={filters.notes}
              onChange={(event) => setFilters((prev) => ({ ...prev, notes: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="yes">With notes</option>
              <option value="no">Without notes</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Files</span>
            <select
              value={filters.files}
              onChange={(event) => setFilters((prev) => ({ ...prev, files: event.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="yes">With files</option>
              <option value="no">Without files</option>
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

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>
            {viewMode === 'tree'
              ? 'Answers by area'
              : total === 0
                ? '0 answers'
                : `${total} answer${total === 1 ? '' : 's'} · page ${currentPage} of ${totalPages}`}
            {viewMode === 'table' && hasActiveFilters ? ' · filters active' : ''}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex rounded-md border border-[var(--border)] p-0.5"
              role="group"
              aria-label="Answers view"
            >
              {(['table', 'tree'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => persistViewMode(mode)}
                  className={`rounded px-3 py-1 text-sm capitalize ${
                    viewMode === mode
                      ? 'bg-[var(--accent)] font-medium text-white'
                      : 'text-[var(--foreground)] hover:bg-[var(--accent-soft)]'
                  }`}
                >
                  {mode === 'table' ? 'Table' : 'Tree'}
                </button>
              ))}
            </div>
            {viewMode === 'table' ? (
              <>
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
                  columns={answerColumns}
                  isVisible={isVisible}
                  toggle={toggle}
                  showFilters={showFilters}
                  onToggleFilters={() => setShowFilters((prev) => !prev)}
                />
              </>
            ) : null}
          </div>
        </div>

        {viewMode === 'tree' ? (
          <AnswersAreaTree
            title={sheet.surveyName || 'Instrument sheet'}
            questions={sheet.questions}
            answers={sheet.answers}
            rootScore={score}
            layoutStorageKey={`answers_tree_layout_v1:${surveyId}:${subjectType}:${subjectId}`}
            fileCountByQuestion={fileCountByQuestion}
            onViewNotes={setNotesQuestionId}
            onViewFiles={setFilesQuestionId}
          />
        ) : pageRows.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No answers match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  {isVisible('index') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('index')} className="hover:text-[var(--accent)]">
                        #{sortIndicator('index')}
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
                  {isVisible('area') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('area')} className="hover:text-[var(--accent)]">
                        Area{sortIndicator('area')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('prompt') ? <th className="px-4 py-3 font-medium">Question</th> : null}
                  {isVisible('type') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('type')} className="hover:text-[var(--accent)]">
                        Type{sortIndicator('type')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('answer') ? (
                    <th className="px-4 py-3 font-medium">
                      <button type="button" onClick={() => toggleSort('answer')} className="hover:text-[var(--accent)]">
                        Answer{sortIndicator('answer')}
                      </button>
                    </th>
                  ) : null}
                  {isVisible('actions') ? (
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.question.questionId}
                    className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                  >
                    {isVisible('index') ? <td className="px-4 py-3">{row.index + 1}</td> : null}
                    {isVisible('code') ? <td className="px-4 py-3">{row.question.code || '—'}</td> : null}
                    {isVisible('area') ? <td className="px-4 py-3">{row.question.area || '—'}</td> : null}
                    {isVisible('prompt') ? (
                      <td className="px-4 py-3 font-medium">{row.question.prompt}</td>
                    ) : null}
                    {isVisible('type') ? (
                      <td className="px-4 py-3">{row.question.type.replaceAll('_', ' ')}</td>
                    ) : null}
                    {isVisible('answer') ? (
                      <td className="px-4 py-3">
                        {row.value || '—'}
                        {row.question.type === 'score' && row.question.maxPoints
                          ? ` / ${row.question.maxPoints}`
                          : ''}
                      </td>
                    ) : null}
                    {isVisible('actions') ? (
                      <td className="px-4 py-3 text-right">
                        {row.notes.trim() || row.fileCount ? (
                          <TableActionRow alwaysVisible>
                            {row.notes.trim() ? (
                              <AccessIconButton
                                allowed
                                icon="notes"
                                label="View notes"
                                onClick={() => setNotesQuestionId(row.question.questionId)}
                              />
                            ) : null}
                            {row.fileCount ? (
                              <span className="relative inline-flex">
                                <AccessIconButton
                                  allowed
                                  icon="attach"
                                  label={`View files (${row.fileCount})`}
                                  onClick={() => setFilesQuestionId(row.question.questionId)}
                                />
                                <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
                                  {row.fileCount > 9 ? '9+' : row.fileCount}
                                </span>
                              </span>
                            ) : null}
                          </TableActionRow>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === 'table' ? (
          <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[var(--muted)]">
              {total === 0
                ? '0 answers'
                : `Showing page ${currentPage} of ${totalPages} (${total} total)`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>
            {sortedRevisions.length === 0
              ? '0 revisions'
              : `${sortedRevisions.length} revision${sortedRevisions.length === 1 ? '' : 's'}`}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Sorted by {revisionSort} ({revisionOrder})
            </span>
            <TableOptionsMenu
              columns={revisionColumns}
              isVisible={isRevisionVisible}
              toggle={toggleRevisionColumn}
            />
          </div>
        </div>
        {sortedRevisions.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No saved revisions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  {isRevisionVisible('revision') ? (
                    <th className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleRevisionSort('revision')}
                        className="hover:text-[var(--accent)]"
                      >
                        Revision{revisionSortIndicator('revision')}
                      </button>
                    </th>
                  ) : null}
                  {isRevisionVisible('status') ? (
                    <th className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleRevisionSort('status')}
                        className="hover:text-[var(--accent)]"
                      >
                        Status{revisionSortIndicator('status')}
                      </button>
                    </th>
                  ) : null}
                  {isRevisionVisible('score') ? (
                    <th className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleRevisionSort('score')}
                        className="hover:text-[var(--accent)]"
                      >
                        Score{revisionSortIndicator('score')}
                      </button>
                    </th>
                  ) : null}
                  {isRevisionVisible('createdAt') ? (
                    <th className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleRevisionSort('createdAt')}
                        className="hover:text-[var(--accent)]"
                      >
                        Saved{revisionSortIndicator('createdAt')}
                      </button>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {sortedRevisions.map((row) => (
                  <tr key={row._id} className="border-b border-[var(--border)] last:border-0">
                    {isRevisionVisible('revision') ? (
                      <td className="px-4 py-3 font-medium">
                        {row.revision}
                        {row.revision === sheet.revision ? (
                          <span className="ml-2 text-xs text-[var(--muted)]">current</span>
                        ) : null}
                      </td>
                    ) : null}
                    {isRevisionVisible('status') ? (
                      <td className="px-4 py-3">{formatStatus(row.snapshot?.status)}</td>
                    ) : null}
                    {isRevisionVisible('score') ? (
                      <td className="px-4 py-3">{formatScore(row.snapshot?.computedScore)}</td>
                    ) : null}
                    {isRevisionVisible('createdAt') ? (
                      <td className="whitespace-nowrap px-4 py-3">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {notesQuestion ? (
        <QuestionNotesModal
          isOpen
          title={`Notes · ${notesQuestion.code ? `${notesQuestion.code} · ` : ''}${notesQuestion.prompt}`}
          value={notesValue}
          hint={notesQuestion.evidence ? `Evidence: ${notesQuestion.evidence}` : undefined}
          canWrite={false}
          onClose={() => setNotesQuestionId(null)}
        />
      ) : null}

      {filesQuestion ? (
        <QuestionFilesModal
          isOpen
          title={`Evidence · ${filesQuestion.code ? `${filesQuestion.code} · ` : ''}${filesQuestion.prompt}`}
          listEndpoint={`${basePath}/files`}
          questionId={filesQuestion.questionId}
          canWrite={false}
          sheetSaved={Boolean(sheet._id)}
          onClose={() => setFilesQuestionId(null)}
        />
      ) : null}
    </div>
  );
}
