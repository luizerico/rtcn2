"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { apiGet } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useGoBack } from '@/lib/useGoBack';

interface VersionQuestion {
  questionId: string;
  code?: string;
  prompt: string;
}

interface Score {
  letter?: string;
  percent?: number;
  total?: number;
  maxTotal?: number;
}

interface SheetPayload {
  version?: number;
  questions: VersionQuestion[];
}

interface RevisionRow {
  _id: string;
  revision: number;
  createdAt?: string;
  snapshot?: {
    status?: string;
    answers?: Array<{ questionId: string; value?: string | number; obs?: string }>;
    computedScore?: Score;
  };
}

function formatScore(score?: Score) {
  if (!score) return '—';
  const parts: string[] = [];
  if (score.letter) parts.push(score.letter);
  if (score.percent != null) parts.push(`${score.percent}%`);
  if (score.total != null && score.maxTotal != null) {
    parts.push(`${score.total}/${score.maxTotal}`);
  }
  return parts.join(' · ') || '—';
}

function answerMap(
  answers?: Array<{ questionId: string; value?: string | number; obs?: string }>
) {
  return new Map((answers || []).map((row) => [String(row.questionId), row]));
}

export default function CompareRevisionsPage() {
  const params = useParams<{ id: string; subjectType: string; subjectId: string }>();
  const searchParams = useSearchParams();
  const surveyId = params.id;
  const subjectType = String(params.subjectType || '').toUpperCase();
  const subjectId = params.subjectId;
  const basePath = `/surveys/${surveyId}/subjects/${subjectType}/${subjectId}`;
  const goBack = useGoBack(`${basePath}/view`);

  const [questions, setQuestions] = useState<VersionQuestion[]>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [leftRevision, setLeftRevision] = useState<number | ''>('');
  const [rightRevision, setRightRevision] = useState<number | ''>('');
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sheet, history] = await Promise.all([
        apiGet<SheetPayload>(basePath),
        apiGet<{ items: RevisionRow[] }>(`${basePath}/revisions`),
      ]);
      setQuestions(sheet.questions || []);
      const items = history.items || [];
      setRevisions(items);
      const requestedLeft = Number(searchParams.get('left'));
      const requestedRight = Number(searchParams.get('right'));
      const hasLeft = items.some((row) => row.revision === requestedLeft);
      const hasRight = items.some((row) => row.revision === requestedRight);
      if (hasLeft && hasRight) {
        setLeftRevision(requestedLeft);
        setRightRevision(requestedRight);
      } else if (items.length >= 2) {
        setRightRevision(items[items.length - 1].revision);
        setLeftRevision(items[items.length - 2].revision);
      } else if (items.length === 1) {
        setLeftRevision(items[0].revision);
        setRightRevision(items[0].revision);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load revisions.');
    } finally {
      setLoading(false);
    }
  }, [basePath, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const leftSnap = revisions.find((row) => row.revision === Number(leftRevision))?.snapshot;
  const rightSnap = revisions.find((row) => row.revision === Number(rightRevision))?.snapshot;
  const leftAnswers = useMemo(() => answerMap(leftSnap?.answers), [leftSnap]);
  const rightAnswers = useMemo(() => answerMap(rightSnap?.answers), [rightSnap]);

  const rows = useMemo(() => {
    return questions.map((question) => {
      const prev = leftAnswers.get(question.questionId);
      const next = rightAnswers.get(question.questionId);
      const changed =
        String(prev?.value ?? '') !== String(next?.value ?? '') ||
        String(prev?.obs ?? '') !== String(next?.obs ?? '');
      return { question, prev, next, changed };
    });
  }, [leftAnswers, questions, rightAnswers]);

  const visibleRows = onlyChanges ? rows.filter((row) => row.changed) : rows;

  if (loading) return <p className="text-[var(--muted)]">Loading comparison…</p>;
  if (error) {
    return (
      <div className="space-y-3">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Surveys', href: '/surveys' },
            { label: 'View answers', href: `${basePath}/view` },
            { label: 'Compare' },
          ]}
        />
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Surveys', href: '/surveys' },
            { label: 'View answers', href: `${basePath}/view` },
            { label: 'Compare revisions' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Compare revisions</h1>
        <p className="mt-2 text-[var(--muted)]">
          {subjectType} · {revisions.length} saved revision{revisions.length === 1 ? '' : 's'}
        </p>
      </header>

      {revisions.length < 2 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
          Save the sheet at least twice to compare revisions.{' '}
          <button
            type="button"
            onClick={goBack}
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Go back
          </button>
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Revision A</span>
                <select
                  value={leftRevision}
                  onChange={(event) => setLeftRevision(Number(event.target.value))}
                  className="rounded-md border border-[var(--border)] px-3 py-2"
                >
                  {revisions.map((row) => (
                    <option key={row._id} value={row.revision}>
                      Revision {row.revision}
                      {row.createdAt ? ` · ${new Date(row.createdAt).toLocaleString()}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-4 text-2xl font-semibold">{formatScore(leftSnap?.computedScore)}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Status {leftSnap?.status?.replace('_', ' ') || '—'}
              </p>
            </article>
            <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">Revision B</span>
                <select
                  value={rightRevision}
                  onChange={(event) => setRightRevision(Number(event.target.value))}
                  className="rounded-md border border-[var(--border)] px-3 py-2"
                >
                  {revisions.map((row) => (
                    <option key={row._id} value={row.revision}>
                      Revision {row.revision}
                      {row.createdAt ? ` · ${new Date(row.createdAt).toLocaleString()}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-4 text-2xl font-semibold">{formatScore(rightSnap?.computedScore)}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Status {rightSnap?.status?.replace('_', ' ') || '—'}
              </p>
            </article>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setOnlyChanges((value) => !value)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
            >
              {onlyChanges ? 'Show all entries' : 'Show only changes'}
            </button>
            <button
              type="button"
              onClick={goBack}
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Go back
            </button>
          </div>

          {visibleRows.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              {onlyChanges ? 'No answers changed between these revisions.' : 'No questions on this instrument.'}
            </p>
          ) : (
            <div className="space-y-2">
              {visibleRows.map(({ question, prev, next, changed }) => (
                <div
                  key={question.questionId}
                  className={`rounded-md border px-3 py-3 text-sm ${
                    changed ? 'border-amber-300 bg-amber-50' : 'border-[var(--border)] bg-[var(--surface)]'
                  }`}
                >
                  <p className="font-medium">
                    {question.code ? `${question.code} · ` : ''}
                    {question.prompt}
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <p>
                      <span className="text-[var(--muted)]">A:</span> {String(prev?.value ?? '—')}
                    </p>
                    <p>
                      <span className="text-[var(--muted)]">B:</span> {String(next?.value ?? '—')}
                    </p>
                    <p className="text-[var(--muted)]">Notes: {prev?.obs || '—'}</p>
                    <p className="text-[var(--muted)]">Notes: {next?.obs || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
