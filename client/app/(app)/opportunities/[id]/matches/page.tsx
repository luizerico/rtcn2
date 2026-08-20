"use client";

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import { useAccess } from '@/components/AccessProvider';
import { useToast } from '@/components/ToastProvider';
import { apiGet, apiPost } from '@/lib/apiUtils';
import {
  DIMENSION_LABELS,
  SCORE_WEIGHTS,
  formatGrade,
  formatRunWhen,
  isInFlightRun,
  topCodes,
  type OpportunityCountyMatch,
  type OpportunityMatchRun,
  type OpportunityMatchesResponse,
} from '@/lib/opportunityMatch';
import { type OpportunityRecord } from '@/lib/fundingTypes';
import {
  ANALYSIS_POLL_INITIAL_MS,
  nextAnalysisPollDelay,
} from '@/lib/storedFileTypes';

function ProjectRecordId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && '_id' in value) {
    return String((value as { _id: string })._id);
  }
  return '';
}

function runHeading(row: OpportunityMatchRun) {
  const counties = row.matches?.length || 0;
  const who =
    row.createdBy && typeof row.createdBy === 'object'
      ? row.createdBy.username || row.createdBy.email
      : '';
  return [
    formatRunWhen(row.createdAt),
    row.mode,
    row.status,
    `${counties} count${counties === 1 ? 'y' : 'ies'}`,
    who ? `by ${who}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function MatchResultsTable({
  run,
  weights,
  expandedKey,
  onToggleExpand,
  canCreateProject,
  creating,
  onCreate,
}: {
  run: OpportunityMatchRun;
  weights: Record<string, number>;
  expandedKey: string | null;
  onToggleExpand: (key: string) => void;
  canCreateProject: boolean;
  creating: string | null;
  onCreate: (run: OpportunityMatchRun, match: OpportunityCountyMatch) => void;
}) {
  const matches = run.matches || [];
  if (matches.length === 0) {
    return (
      <p className="p-5 text-[var(--muted)]">
        {isInFlightRun(run.status)
          ? 'Analysis is running…'
          : 'No counties were correlated for this opportunity in this run.'}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="headers-nowrap min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">County</th>
            <th className="px-4 py-3 font-medium">Grade</th>
            <th className="px-4 py-3 font-medium">Codes</th>
            <th className="px-4 py-3 font-medium">Overall</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => {
            const rowKey = `${run._id}:${match.countyId}`;
            const open = expandedKey === rowKey;
            return (
              <Fragment key={rowKey}>
                <tr className="border-b border-[var(--border)]">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => onToggleExpand(rowKey)}
                    >
                      {match.countyName}
                    </button>
                    {match.IBGECode ? (
                      <p className="text-xs text-[var(--muted)]">{match.IBGECode}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {formatGrade(match.gradeBefore)} → {formatGrade(match.gradeAfter)}
                  </td>
                  <td className="px-4 py-3">{topCodes(match).join(', ') || '—'}</td>
                  <td className="px-4 py-3 font-medium tabular-nums">{match.overallScore}</td>
                  <td className="px-4 py-3 text-right">
                    {match.projectId ? (
                      <Link
                        href={`/projects/${match.projectId}`}
                        className="text-sm text-[var(--accent)] hover:underline"
                      >
                        Open project
                      </Link>
                    ) : (
                      <AccessPrimaryButton
                        allowed={canCreateProject}
                        disabled={creating === rowKey}
                        onClick={() => onCreate(run, match)}
                      >
                        {creating === rowKey ? 'Creating…' : 'Create project'}
                      </AccessPrimaryButton>
                    )}
                  </td>
                </tr>
                {open ? (
                  <tr className="border-b border-[var(--border)] bg-[var(--accent-soft)]/20">
                    <td colSpan={5} className="px-4 py-4">
                      <p className="text-sm">{match.rationale || 'No rationale.'}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(match.dimensions || {}).map(([key, dim]) => (
                          <span
                            key={key}
                            title={dim.note || DIMENSION_LABELS[key] || key}
                            className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs"
                          >
                            {DIMENSION_LABELS[key] || key}: {dim.score}
                          </span>
                        ))}
                      </div>
                      {(match.matchedCodes || []).length ? (
                        <ul className="mt-3 space-y-1 text-sm">
                          {(match.matchedCodes || []).map((code) => (
                            <li key={`${code.questionId}-${code.code}`}>
                              <span className="font-medium">{code.code}</span>
                              {code.area ? ` · ${code.area}` : ''}
                              {code.todo ? ` — ${code.todo}` : ''}
                              {code.technicalPriority != null ? ` · tech ${code.technicalPriority}` : ''}
                              {code.governmentPriority != null
                                ? ` · gov ${code.governmentPriority}`
                                : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {match.gradeAfter?.byArea ? (
                        <p className="mt-3 text-xs text-[var(--muted)]">
                          Area scores after:{' '}
                          {Object.entries(match.gradeAfter.byArea)
                            .map(([area, row]) => `${area} ${row.total}/${row.maxTotal}`)
                            .join(' · ') || '—'}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Weights:{' '}
                        {Object.entries(weights)
                          .map(([key, value]) => `${DIMENSION_LABELS[key] || key} ${value}`)
                          .join(' · ')}
                      </p>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function OpportunityMatchesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canCreateProject = can('PROJECT:CREATE', { classWideOnly: true });
  const [opportunity, setOpportunity] = useState<OpportunityRecord | null>(null);
  const [latest, setLatest] = useState<OpportunityMatchRun | null>(null);
  const [weights, setWeights] = useState(SCORE_WEIGHTS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [opp, matches] = await Promise.all([
        apiGet<OpportunityRecord>(`/opportunities/${params.id}`),
        apiGet<OpportunityMatchesResponse>(`/opportunities/${params.id}/matches`),
      ]);
      setOpportunity(opp);
      setLatest(matches.latest || matches.history?.[0] || null);
      if (matches.scoreWeights) setWeights(matches.scoreWeights as typeof SCORE_WEIGHTS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load county matches.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!latest?._id || !isInFlightRun(latest.status)) return undefined;
    let cancelled = false;
    let delay = ANALYSIS_POLL_INITIAL_MS;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled || !latest?._id) return;
      try {
        const next = await apiGet<OpportunityMatchRun>(`/opportunity-matches/${latest._id}`);
        if (cancelled) return;
        setLatest(next);
        if (!isInFlightRun(next.status)) return;
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
  }, [latest?._id, latest?.status]);

  const handleCreate = async (run: OpportunityMatchRun, match: OpportunityCountyMatch) => {
    const rowKey = `${run._id}:${match.countyId}`;
    setCreating(rowKey);
    try {
      const project = await apiPost<{ _id: string }>(
        `/opportunities/${params.id}/matches/${run._id}/counties/${match.countyId}/project`
      );
      const id = ProjectRecordId(project._id);
      setLatest((prev) =>
        prev && prev._id === run._id
          ? {
              ...prev,
              matches: (prev.matches || []).map((item) =>
                item.countyId === match.countyId ? { ...item, projectId: id } : item
              ),
            }
          : prev
      );
      pushToast({
        tone: 'success',
        title: 'Project created',
        message: match.countyName,
      });
      router.push(`/projects/${id}`);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Create project failed',
        message: err instanceof Error ? err.message : 'Could not create project.',
      });
      setCreating(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Opportunities', href: '/opportunities' },
            { label: opportunity?.name || 'Opportunity', href: `/opportunities/${params.id}` },
            { label: 'County matches' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Correlated counties</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Estimated survey-grade improvements and impact scores for counties that have a survey
          and/or local plan, from the most recent analysis.
        </p>
      </header>

      {loading ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {!loading && !latest ? (
        <p className="text-[var(--muted)]">
          No match analysis yet.{' '}
          <Link href="/admin/opportunity-matches" className="text-[var(--accent)] hover:underline">
            Run analysis from Admin
          </Link>
          .
        </p>
      ) : null}

      {latest ? (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm text-[var(--muted)]">{runHeading(latest)}</p>
            {latest.error ? <p className="mt-1 text-sm text-red-700">{latest.error}</p> : null}
          </div>
          <MatchResultsTable
            run={latest}
            weights={weights}
            expandedKey={expanded}
            onToggleExpand={(key) => setExpanded((current) => (current === key ? null : key))}
            canCreateProject={canCreateProject}
            creating={creating}
            onCreate={handleCreate}
          />
        </section>
      ) : null}

      <Link href={`/opportunities/${params.id}`} className="text-sm text-[var(--accent)] hover:underline">
        Back to opportunity
      </Link>
    </div>
  );
}
