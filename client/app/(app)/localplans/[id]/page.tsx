"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPost, apiPut } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useToast } from '@/components/ToastProvider';
import AreaStepper from '@/components/surveys/AreaStepper';
import LocalPlanTable, { type PlanViewMode } from '@/components/localplans/LocalPlanTable';
import {
  areaLabel,
  formatPlanStatus,
  type LocalPlanChange,
  type LocalPlanRecord,
  type PlanEntry,
} from '@/lib/localPlan';

function groupByArea(entries: PlanEntry[]) {
  const order: string[] = [];
  const groups = new Map<string, PlanEntry[]>();
  for (const entry of entries) {
    const id = (entry.area || '').trim() || 'General';
    if (!groups.has(id)) {
      order.push(id);
      groups.set(id, []);
    }
    groups.get(id)!.push(entry);
  }
  return order.map((id) => ({
    id,
    label: areaLabel(id),
    entries: groups.get(id) || [],
  }));
}

export default function LocalPlanEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { pushToast } = useToast();
  const [plan, setPlan] = useState<LocalPlanRecord | null>(null);
  const [changes, setChanges] = useState<LocalPlanChange[]>([]);
  const [mode, setMode] = useState<PlanViewMode>('technical');
  const [areaIndex, setAreaIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, log] = await Promise.all([
        apiGet<LocalPlanRecord>(`/localplans/${id}`),
        apiGet<{ items: LocalPlanChange[] }>(`/localplans/${id}/changes`).catch(() => ({ items: [] })),
      ]);
      setPlan(detail);
      setChanges(log.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load local plan.');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const areas = useMemo(() => groupByArea(plan?.entries || []), [plan]);
  const safeIndex = Math.min(areaIndex, Math.max(0, areas.length - 1));
  const current = areas[safeIndex];

  const patchEntry = async (questionId: string, patch: Partial<PlanEntry>) => {
    if (!plan?.canWrite) return;
    const previous = plan;
    const entries = (plan.entries || []).map((entry) =>
      entry.questionId === questionId ? { ...entry, ...patch, technical: patch.technical || entry.technical, consultant: patch.consultant || entry.consultant } : entry
    );
    setPlan({ ...plan, entries });
    setSaving(true);
    try {
      const updated = await apiPut<LocalPlanRecord>(`/localplans/${plan._id}`, {
        entries: [{ questionId, ...patch }],
      });
      setPlan(updated);
    } catch (err) {
      setPlan(previous);
      pushToast({
        tone: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Could not save this entry.',
      });
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async () => {
    if (!plan) return;
    setPromoting(true);
    try {
      const updated = await apiPost<LocalPlanRecord>(`/localplans/${plan._id}/default`);
      setPlan(updated);
      pushToast({ tone: 'success', title: 'Default updated', message: 'This plan is now the default.' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Could not set default',
        message: err instanceof Error ? err.message : 'Request failed.',
      });
    } finally {
      setPromoting(false);
    }
  };

  if (loading) {
    return <p className="mx-auto max-w-7xl px-4 py-12 text-sm text-[var(--muted)]">Loading local plan…</p>;
  }
  if (error || !plan) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-12">
        <p className="text-red-700">{error || 'Local plan not found.'}</p>
        <Link href="/localplans" className="text-[var(--accent)] hover:underline">
          Back to local plans
        </Link>
      </div>
    );
  }

  const areaSteps = areas.map((area) => ({
    id: area.id,
    label: area.label,
    total: area.entries.length,
    answered: area.entries.length,
    complete: true,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Local plans', href: '/localplans' },
            { label: plan.name },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Local Agenda</h1>
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
              <p>
                <span className="text-[var(--muted)]">County:</span> {plan.countyName || '—'}
              </p>
              <p>
                <span className="text-[var(--muted)]">Questionnaire:</span> {plan.surveyName || '—'}
              </p>
              <p>
                <span className="text-[var(--muted)]">Status:</span> {formatPlanStatus(plan.status)} · rev{' '}
                {plan.sourceRevision}
                {saving ? ' · Saving…' : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push('/localplans')}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
            >
              Back
            </button>
            {plan.status !== 'default' && plan.canWrite ? (
              <button
                type="button"
                disabled={promoting}
                onClick={() => void setDefault()}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
              >
                {promoting ? 'Updating…' : 'Set as default'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setMode('technical')}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                mode === 'technical'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border)]'
              }`}
            >
              Technical
            </button>
            <button
              type="button"
              onClick={() => setMode('government')}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                mode === 'government'
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border)]'
              }`}
            >
              Government
            </button>
          </div>
        </div>
      </header>

      {plan.siblings?.length ? (
        <label className="flex max-w-md flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Other drafts for this county and survey</span>
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) router.push(`/localplans/${event.target.value}`);
            }}
            className="rounded-md border border-[var(--border)] px-3 py-2"
          >
            <option value="">Open another version…</option>
            {plan.siblings.map((row) => (
              <option key={row._id} value={row._id}>
                {row.name} · {formatPlanStatus(row.status)} · rev {row.sourceRevision}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {areas.length ? (
        <AreaStepper areas={areaSteps} currentIndex={safeIndex} onSelect={setAreaIndex} />
      ) : null}

      <LocalPlanTable
        entries={current?.entries || []}
        mode={mode}
        canWrite={Boolean(plan.canWrite)}
        onPatch={(questionId, patch) => void patchEntry(questionId, patch)}
      />

      {areas.length ? (
        <AreaStepper
          areas={areaSteps}
          currentIndex={safeIndex}
          onSelect={setAreaIndex}
          autoScroll={false}
        />
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold">Change log</h2>
        {changes.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">No tracked changes yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {changes.map((row) => (
              <li key={row._id} className="border-b border-[var(--border)] pb-2 last:border-0">
                <span className="font-medium">{row.reason.replaceAll('_', ' ')}</span>
                {row.sourceRevision ? ` · rev ${row.sourceRevision}` : ''}
                {row.createdAt ? ` · ${new Date(row.createdAt).toLocaleString()}` : ''}
                {row.added?.length ? (
                  <span className="block text-emerald-700">
                    Added: {row.added.map((item) => item.code || item.questionId).join(', ')}
                  </span>
                ) : null}
                {row.removed?.length ? (
                  <span className="block text-red-700">
                    Removed: {row.removed.map((item) => item.code || item.questionId).join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
