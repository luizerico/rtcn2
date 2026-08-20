"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import { useToast } from '@/components/ToastProvider';
import { AnalysisResultView } from '@/components/files/AnalysisResultView';
import { apiGet, apiPost } from '@/lib/apiUtils';
import {
  formatRunWhen,
  isInFlightRun,
  type OpportunityMatchRun,
} from '@/lib/opportunityMatch';
import {
  ANALYSIS_POLL_INITIAL_MS,
  nextAnalysisPollDelay,
} from '@/lib/storedFileTypes';

function JsonBlock({ value }: { value: unknown }) {
  if (value == null || value === '') {
    return <p className="text-sm text-[var(--muted)]">None.</p>;
  }
  const text =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-[28rem] overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs whitespace-pre-wrap">
      {text}
    </pre>
  );
}

export default function OpportunityMatchRunDetailsPage() {
  const params = useParams<{ runId: string }>();
  const { pushToast } = useToast();
  const [run, setRun] = useState<OpportunityMatchRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiGet<OpportunityMatchRun>(`/opportunity-matches/${params.runId}`);
      setRun(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load match run.');
    } finally {
      setLoading(false);
    }
  }, [params.runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!run?._id || !isInFlightRun(run.status)) return undefined;
    let cancelled = false;
    let delay = ANALYSIS_POLL_INITIAL_MS;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled || !run?._id) return;
      try {
        const next = await apiGet<OpportunityMatchRun>(`/opportunity-matches/${run._id}`);
        if (cancelled) return;
        setRun(next);
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
  }, [run?._id, run?.status]);

  const handleCancel = async () => {
    if (!run?._id) return;
    setCancelling(true);
    try {
      const next = await apiPost<OpportunityMatchRun>(`/opportunity-matches/${run._id}/cancel`);
      setRun(next);
      pushToast({ tone: 'info', title: 'Run cancelled', message: 'Queued RTCNAI jobs were cancelled.' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Cancel failed',
        message: err instanceof Error ? err.message : 'Could not cancel this run.',
      });
    } finally {
      setCancelling(false);
    }
  };

  const who =
    run?.createdBy && typeof run.createdBy === 'object'
      ? run.createdBy.username || run.createdBy.email
      : '';

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Opportunity matches', href: '/admin/opportunity-matches' },
            { label: 'Run details' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Match run details</h1>
            <p className="mt-2 max-w-3xl text-[var(--muted)]">
              Prompt, request parameters, context data sent to RTCNAI, and the returned result.
            </p>
          </div>
          {run && isInFlightRun(run.status) ? (
            <AccessPrimaryButton allowed disabled={cancelling} onClick={() => void handleCancel()}>
              {cancelling ? 'Cancelling…' : 'Cancel run'}
            </AccessPrimaryButton>
          ) : null}
        </div>
      </header>

      {loading ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {run ? (
        <>
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">Run</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[var(--muted)]">When</dt>
                <dd>{formatRunWhen(run.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Mode</dt>
                <dd>{run.mode}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Status</dt>
                <dd>
                  {run.status}
                  {run.error ? ` · ${run.error}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Created by</dt>
                <dd>{who || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Candidates</dt>
                <dd>{run.candidateCount || 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Matched counties</dt>
                <dd>{run.matches?.length || 0}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-[var(--muted)]">Opportunities</dt>
                <dd className="mt-1 space-x-3">
                  {(run.opportunities || []).map((item) => (
                    <Link
                      key={item._id}
                      href={`/opportunities/${item._id}/matches`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {item.name || item._id}
                    </Link>
                  ))}
                  {!run.opportunities?.length
                    ? run.opportunityIds.map((id) => (
                        <Link
                          key={id}
                          href={`/opportunities/${id}/matches`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {id}
                        </Link>
                      ))
                    : null}
                </dd>
              </div>
            </dl>
          </section>

          {(run.promptSnapshot && Object.keys(run.promptSnapshot).length > 0) ? (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-lg font-semibold">Prompt snapshot</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Prompt text saved when this run started.
              </p>
              {Object.entries(run.promptSnapshot).map(([key, body]) => (
                <div key={key} className="mt-4">
                  <h3 className="text-sm font-medium">{key}</h3>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs whitespace-pre-wrap">
                    {body}
                  </pre>
                </div>
              ))}
            </section>
          ) : null}

          {(run.steps || []).map((step, index) => (
            <section
              key={step._id || step.key}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <h2 className="text-lg font-semibold">
                Step {index + 1}: {step.kind}
                <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                  {step.status}
                  {step.jobId ? ` · job ${step.jobId}` : ''}
                </span>
              </h2>
              {step.error ? <p className="mt-2 text-sm text-red-700">{step.error}</p> : null}

              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium">Request parameters</h3>
                  <dl className="mt-2 space-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-[var(--muted)]">Method / path</dt>
                      <dd>
                        {step.request?.method || 'POST'} {step.request?.path || '/v1/analyses'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--muted)]">URL parameters</dt>
                      <dd>
                        {step.request?.query
                          ? Object.entries(step.request.query)
                              .map(([key, value]) => `${key}=${value}`)
                              .join(' · ') || '—'
                          : 'response_format=json'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--muted)]">Body</dt>
                      <dd>
                        {step.request?.body?.provider || '—'}
                        {step.request?.body?.uri ? ` · ${step.request.body.uri}` : ''}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Prompt</h3>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs whitespace-pre-wrap">
                    {step.prompt || '—'}
                  </pre>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Sent data</h3>
                <div className="mt-2">
                  <JsonBlock value={step.requestPayload} />
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Returned result</h3>
                <div className="mt-2">
                  {step.rawResult && typeof step.rawResult === 'object' ? (
                    <AnalysisResultView result={step.rawResult} />
                  ) : (
                    <JsonBlock value={step.rawResult} />
                  )}
                </div>
              </div>
            </section>
          ))}

          <p className="text-sm">
            <Link href="/admin/opportunity-matches" className="text-[var(--accent)] hover:underline">
              Back to opportunity matches
            </Link>
          </p>
        </>
      ) : null}
    </div>
  );
}
