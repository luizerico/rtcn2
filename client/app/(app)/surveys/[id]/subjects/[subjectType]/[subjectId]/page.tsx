"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiDelete, apiGet, apiPut } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import { useAccess } from '@/components/AccessProvider';
import AnswersAreaTree, {
  type AnswersTreeSelection,
} from '@/components/surveys/AnswersAreaTree';
import AreaStepper from '@/components/surveys/AreaStepper';
import QuestionFilesModal from '@/components/surveys/QuestionFilesModal';
import QuestionNotesModal from '@/components/surveys/QuestionNotesModal';
import SheetQuestionCard, {
  groupQuestionsByArea,
  questionAnswered,
  type SheetQuestion,
} from '@/components/surveys/SheetQuestionCard';
import { computeSurveyScore } from '@/lib/surveyScore';
import type { StoredFileRecord } from '@/lib/storedFileTypes';

interface SheetPayload {
  _id?: string;
  instrumentId: string;
  surveyName?: string;
  subjectLabel?: string;
  version?: number;
  subjectType: string;
  subjectId: string;
  status: string;
  answers: Array<{ questionId: string; value: string | number; obs?: string }>;
  revision: number;
  computedScore?: { letter?: string; percent?: number; total?: number; maxTotal?: number };
  ownerId?: string | null;
  canEdit?: boolean;
  canDelete?: boolean;
  questions: SheetQuestion[];
}

interface RevisionList {
  currentRevision?: number;
  items: Array<{
    _id: string;
    revision: number;
    createdAt?: string;
  }>;
}

const OWNER_STATUSES = ['in_progress', 'need_changes'];
const REVIEWER_STATUSES = ['in_progress', 'pending', 'need_changes', 'approved'];
const ADMIN_STATUSES = [...REVIEWER_STATUSES, 'archived'];
const SHOW_ORDER_STORAGE_KEY = 'sheet_edit_show_order_v1';
const EDIT_VIEW_STORAGE_KEY = 'sheet_edit_view_mode_v1';
type EditViewMode = 'steps' | 'tree';

function readEditViewMode(): EditViewMode {
  if (typeof window === 'undefined') return 'steps';
  try {
    return window.localStorage.getItem(EDIT_VIEW_STORAGE_KEY) === 'tree' ? 'tree' : 'steps';
  } catch {
    return 'steps';
  }
}

function readShowOrder(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SHOW_ORDER_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function SubjectInstrumentPage() {
  const params = useParams<{ id: string; subjectType: string; subjectId: string }>();
  const surveyId = params.id;
  const subjectType = String(params.subjectType || '').toUpperCase();
  const subjectId = params.subjectId;
  const router = useRouter();
  const { pushToast } = useToast();
  const { can, isAdmin, user } = useAccess();
  const canReview = isAdmin || can(`${subjectType}:WRITE`, { resourceId: subjectId });

  const [sheet, setSheet] = useState<SheetPayload | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('in_progress');
  const [revisions, setRevisions] = useState<RevisionList['items']>([]);
  const [files, setFiles] = useState<StoredFileRecord[]>([]);
  const [notesQuestionId, setNotesQuestionId] = useState<string | null>(null);
  const [filesQuestionId, setFilesQuestionId] = useState<string | null>(null);
  const [areaIndex, setAreaIndex] = useState(0);
  const [showOrder, setShowOrder] = useState(false);
  const [viewMode, setViewMode] = useState<EditViewMode>('steps');
  const [treeSelectedId, setTreeSelectedId] = useState('root');
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basePath = `/surveys/${surveyId}/subjects/${subjectType}/${subjectId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<SheetPayload>(basePath);
      setSheet(data);
      setStatus(data.status || 'in_progress');
      const nextValues: Record<string, string> = {};
      const nextObs: Record<string, string> = {};
      for (const answer of data.answers || []) {
        nextValues[answer.questionId] = String(answer.value ?? '');
        nextObs[answer.questionId] = answer.obs || '';
      }
      setValues(nextValues);
      setObs(nextObs);
      if (data._id) {
        const [history, listed] = await Promise.all([
          apiGet<RevisionList>(`${basePath}/revisions`),
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
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setShowOrder(readShowOrder());
    setViewMode(readEditViewMode());
  }, []);

  const canWrite = useMemo(() => {
    if (sheet?.canEdit != null) return sheet.canEdit;
    if (isAdmin) return true;
    if (can(`${subjectType}:WRITE`, { resourceId: subjectId })) return true;
    if (!sheet?._id) return can(`${subjectType}:CREATE`, { resourceId: subjectId });
    const ownerEditable = sheet.status === 'in_progress' || sheet.status === 'need_changes';
    return ownerEditable && Boolean(user?.id) && sheet.ownerId === user.id;
  }, [can, isAdmin, sheet, subjectId, subjectType, user?.id]);

  const canDelete = useMemo(() => {
    if (!sheet?._id) return false;
    if (sheet.canDelete != null) return sheet.canDelete;
    if (isAdmin) return true;
    if (can(`${subjectType}:DELETE`, { resourceId: subjectId })) return true;
    const ownerEditable = sheet.status === 'in_progress' || sheet.status === 'need_changes';
    return ownerEditable && Boolean(user?.id) && sheet.ownerId === user.id;
  }, [can, isAdmin, sheet, subjectId, subjectType, user?.id]);

  const statusChoices = isAdmin ? ADMIN_STATUSES : canReview ? REVIEWER_STATUSES : OWNER_STATUSES;

  const fileCountByQuestion = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const file of files) {
      const questionId = file.questionId || '';
      if (!questionId) continue;
      counts[questionId] = (counts[questionId] || 0) + 1;
    }
    return counts;
  }, [files]);

  const questionOrderById = useMemo(() => {
    const map = new Map<string, number>();
    (sheet?.questions || []).forEach((question, index) => {
      map.set(question.questionId, index);
    });
    return map;
  }, [sheet?.questions]);

  const areaGroups = useMemo(
    () => groupQuestionsByArea(sheet?.questions || []),
    [sheet?.questions]
  );

  const areaSteps = useMemo(
    () =>
      areaGroups.map((group) => {
        const answered = group.questions.filter((question) =>
          questionAnswered(values[question.questionId])
        ).length;
        return {
          id: group.id,
          label: group.label,
          total: group.questions.length,
          answered,
          complete: group.questions.length > 0 && answered === group.questions.length,
        };
      }),
    [areaGroups, values]
  );

  const safeAreaIndex = Math.min(areaIndex, Math.max(0, areaGroups.length - 1));
  const currentGroup = areaGroups[safeAreaIndex];

  const selectArea = (index: number) => {
    setAreaIndex(index);
  };

  const persistViewMode = (mode: EditViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(EDIT_VIEW_STORAGE_KEY, mode);
    } catch {
      // ignore quota / private mode
    }
  };

  const onToggleShowOrder = (checked: boolean) => {
    setShowOrder(checked);
    try {
      window.localStorage.setItem(SHOW_ORDER_STORAGE_KEY, checked ? '1' : '0');
    } catch {
      // ignore quota / private mode
    }
  };

  const liveAnswers = useMemo(
    () =>
      (sheet?.questions || []).map((question) => ({
        questionId: question.questionId,
        value:
          question.type === 'score'
            ? Number(values[question.questionId] || 0)
            : values[question.questionId] ?? '',
        obs: obs[question.questionId] || '',
      })),
    [obs, sheet?.questions, values]
  );

  const liveScore = useMemo(
    () =>
      computeSurveyScore(
        (sheet?.questions || []).map((question) => ({
          ...question,
          weight: 1,
        })),
        liveAnswers
      ),
    [liveAnswers, sheet?.questions]
  );

  const handleTreeSelect = (selection: AnswersTreeSelection) => {
    setTreeSelectedId(selection.id);
    if (selection.kind === 'root' || !selection.areaId) {
      setPanelOpen(false);
      setFocusQuestionId(null);
      return;
    }
    const index = areaGroups.findIndex((group) => group.id === selection.areaId);
    if (index >= 0) setAreaIndex(index);
    if (selection.kind === 'area' || selection.kind === 'question') {
      setPanelOpen(true);
    }
    setFocusQuestionId(selection.questionId || null);
  };

  const closeAreaPanel = () => {
    setPanelOpen(false);
    setFocusQuestionId(null);
  };

  useEffect(() => {
    if (viewMode !== 'tree' || !panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (notesQuestionId || filesQuestionId) return;
      event.preventDefault();
      closeAreaPanel();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [filesQuestionId, notesQuestionId, panelOpen, viewMode]);

  useEffect(() => {
    if (!focusQuestionId) return;
    const node = document.getElementById(`edit-question-${focusQuestionId}`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [focusQuestionId, panelOpen, safeAreaIndex]);

  const notesQuestion = sheet?.questions.find((question) => question.questionId === notesQuestionId) || null;
  const filesQuestion = sheet?.questions.find((question) => question.questionId === filesQuestionId) || null;

  const saveSheet = async (nextStatus: string) => {
    if (!sheet) return;
    setSaving(true);
    try {
      await apiPut(basePath, {
        status: nextStatus,
        partial: nextStatus === 'in_progress' || nextStatus === 'need_changes',
        answers: sheet.questions.map((question) => ({
          questionId: question.questionId,
          value: question.type === 'score' ? Number(values[question.questionId] || 0) : values[question.questionId] ?? '',
          obs: obs[question.questionId] || '',
        })),
      });
      pushToast({ tone: 'success', title: 'Sheet saved', message: 'Answers were updated.' });
      router.push('/surveys');
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Could not save the sheet.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    await saveSheet(status);
  };

  const handleDelete = async () => {
    if (!sheet?._id) return;
    setDeleting(true);
    try {
      await apiDelete(basePath);
      pushToast({
        tone: 'info',
        title: 'Answer moved to recycle bin',
        message: 'An administrator can restore it from Recycle bin.',
      });
      setDeleteOpen(false);
      router.push('/surveys');
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

  if (loading) return <p className="text-[var(--muted)]">Loading sheet…</p>;
  if (error || !sheet) {
    return (
      <div className="space-y-3">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Surveys', href: '/surveys' }, { label: 'Sheet' }]} />
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
            { label: 'Sheet' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">{sheet.surveyName || 'Instrument sheet'}</h1>
            <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
              {sheet.subjectLabel || subjectId} · {subjectType} · version {sheet.version ?? '—'} ·
              revision {sheet.revision || 0}
              {score?.letter ? ` · ${score.letter} (${score.percent ?? 0}%)` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
            <Link href={`${basePath}/view`} className="text-[var(--accent)] hover:underline">
              View answers
            </Link>
            {revisions.length >= 2 ? (
              <Link href={`${basePath}/compare`} className="text-[var(--accent)] hover:underline">
                Compare revisions
              </Link>
            ) : null}
            {sheet.status === 'approved' && subjectType === 'COUNTY' ? (
              <Link
                href={`/localplans/new?responseId=${sheet._id || ''}`}
                className="text-[var(--accent)] hover:underline"
              >
                Create local plan
              </Link>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                disabled={saving || deleting}
                onClick={() => setDeleteOpen(true)}
                className="text-red-700 hover:underline disabled:opacity-60"
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <form onSubmit={handleSave} className="space-y-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
        {!canWrite ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You can view this sheet but do not have permission to edit it.
          </p>
        ) : null}

        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div
              className="inline-flex rounded-md border border-[var(--border)] p-0.5"
              role="group"
              aria-label="Edit answers view"
            >
              {([
                { id: 'steps' as const, label: 'Steps' },
                { id: 'tree' as const, label: 'Tree' },
              ]).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={viewMode === mode.id}
                  onClick={() => persistViewMode(mode.id)}
                  className={`rounded px-3 py-1 text-sm ${
                    viewMode === mode.id
                      ? 'bg-[var(--accent)] font-medium text-white'
                      : 'text-[var(--foreground)] hover:bg-[var(--accent-soft)]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={showOrder}
                onChange={(event) => onToggleShowOrder(event.target.checked)}
              />
              Show order
            </label>
          </div>

          {viewMode === 'tree' ? (
            <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)]">
              <AnswersAreaTree
                title={sheet.surveyName || 'Instrument sheet'}
                questions={sheet.questions}
                answers={liveAnswers}
                rootScore={liveScore}
                layoutStorageKey={`answers_tree_layout_v1:${surveyId}:${subjectType}:${subjectId}`}
                selectedId={treeSelectedId}
                onSelect={handleTreeSelect}
                fileCountByQuestion={fileCountByQuestion}
                onViewNotes={setNotesQuestionId}
                onViewFiles={setFilesQuestionId}
              />
            </div>
          ) : (
            <>
              <AreaStepper areas={areaSteps} currentIndex={safeAreaIndex} onSelect={selectArea} />

              {currentGroup ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">{currentGroup.label}</h2>
                  {currentGroup.questions.map((question) => (
                    <SheetQuestionCard
                      key={question.questionId}
                      question={question}
                      index={questionOrderById.get(question.questionId) ?? 0}
                      showIndex={showOrder}
                      value={values[question.questionId] ?? ''}
                      canWrite={canWrite}
                      requiredNow={Boolean(question.required) && status !== 'in_progress'}
                      noteCount={obs[question.questionId]?.trim() ? 1 : 0}
                      fileCount={fileCountByQuestion[question.questionId] || 0}
                      sheetSaved={Boolean(sheet._id)}
                      onChange={(value) =>
                        setValues((prev) => ({ ...prev, [question.questionId]: value }))
                      }
                      onNotes={() => setNotesQuestionId(question.questionId)}
                      onFiles={() => setFilesQuestionId(question.questionId)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">This instrument has no questions.</p>
              )}

              <AreaStepper
                areas={areaSteps}
                currentIndex={safeAreaIndex}
                onSelect={selectArea}
                autoScroll={false}
              />
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="flex max-w-xs flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Workflow status</span>
            {canReview ? (
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                disabled={!canWrite}
                className="rounded-md border border-[var(--border)] px-3 py-2"
              >
                {statusChoices.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-md border border-[var(--border)] px-3 py-2">{status.replaceAll('_', ' ')}</span>
            )}
          </label>
          <div className="flex flex-wrap justify-end gap-3">
            <Link
              href="/surveys"
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
            >
              Cancel
            </Link>
            {canWrite && !canReview ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSheet('in_progress')}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)] disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveSheet('approved')}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Complete'}
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={saving || !canWrite}
                className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save sheet'}
              </button>
            )}
          </div>
        </div>
      </form>

      {viewMode === 'tree' ? (
        <div className={`fixed inset-0 z-40 ${panelOpen ? '' : 'pointer-events-none'}`}>
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
              panelOpen ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden="true"
          />
          <aside
            className={`absolute inset-y-0 right-0 flex h-dvh max-h-dvh w-full flex-col bg-[var(--surface)] shadow-2xl transition-transform duration-300 ease-out lg:w-[72vw] lg:max-w-[72vw] ${
              panelOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            aria-hidden={!panelOpen}
            aria-label={currentGroup ? `Questions · ${currentGroup.label}` : 'Questions'}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
              <h2 className="min-w-0 truncate text-lg font-semibold">
                {currentGroup?.label || 'Area'}
              </h2>
              <button
                type="button"
                onClick={closeAreaPanel}
                className="shrink-0 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]"
                aria-label="Close questions panel"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              {currentGroup ? (
                currentGroup.questions.map((question) => (
                  <div
                    key={question.questionId}
                    id={`edit-question-${question.questionId}`}
                    className={
                      focusQuestionId === question.questionId
                        ? 'rounded-lg ring-2 ring-[var(--accent)] ring-offset-2'
                        : undefined
                    }
                  >
                    <SheetQuestionCard
                      question={question}
                      index={questionOrderById.get(question.questionId) ?? 0}
                      showIndex={showOrder}
                      value={values[question.questionId] ?? ''}
                      canWrite={canWrite}
                      requiredNow={Boolean(question.required) && status !== 'in_progress'}
                      noteCount={obs[question.questionId]?.trim() ? 1 : 0}
                      fileCount={fileCountByQuestion[question.questionId] || 0}
                      sheetSaved={Boolean(sheet._id)}
                      onChange={(value) =>
                        setValues((prev) => ({ ...prev, [question.questionId]: value }))
                      }
                      onNotes={() => setNotesQuestionId(question.questionId)}
                      onFiles={() => setFilesQuestionId(question.questionId)}
                    />
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">Select an area to edit its answers.</p>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {notesQuestion ? (
        <QuestionNotesModal
          isOpen
          title={`Notes · ${notesQuestion.code ? `${notesQuestion.code} · ` : ''}${notesQuestion.prompt}`}
          value={obs[notesQuestion.questionId] || ''}
          hint={notesQuestion.evidence ? notesQuestion.evidence : undefined}
          canWrite={canWrite}
          onClose={() => setNotesQuestionId(null)}
          onSave={(value) => {
            setObs((prev) => ({ ...prev, [notesQuestion.questionId]: value }));
            setNotesQuestionId(null);
          }}
        />
      ) : null}

      {filesQuestion ? (
        <QuestionFilesModal
          isOpen
          title={`Evidence · ${filesQuestion.code ? `${filesQuestion.code} · ` : ''}${filesQuestion.prompt}`}
          listEndpoint={`${basePath}/files`}
          questionId={filesQuestion.questionId}
          canWrite={canWrite}
          sheetSaved={Boolean(sheet._id)}
          onClose={() => setFilesQuestionId(null)}
          onItemsChange={(questionFiles) => {
            setFiles((prev) => [
              ...prev.filter((row) => row.questionId !== filesQuestion.questionId),
              ...questionFiles,
            ]);
          }}
        />
      ) : null}

      <ConfirmDeleteDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Move to recycle bin"
        itemLabel={sheet ? `${sheet.surveyName || 'Survey'} · ${sheet.subjectLabel || subjectId}` : undefined}
        description={
          sheet
            ? `Move this “${sheet.surveyName || 'Survey'}” sheet to the recycle bin? An administrator can restore it later.`
            : undefined
        }
        confirmLabel="Move to bin"
        busy={deleting}
      />
    </div>
  );
}
