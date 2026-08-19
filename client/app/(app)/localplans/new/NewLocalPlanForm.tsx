"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import { useToast } from '@/components/ToastProvider';
import { areaLabel, type InclusionMode } from '@/lib/localPlan';

type AnswerRow = {
  _id: string;
  instrumentId: string;
  surveyName: string;
  subjectType: string;
  subjectId: string;
  subjectLabel?: string;
  status: string;
  revision: number;
};

type RevisionList = {
  currentRevision?: number;
  items: Array<{ revision: number }>;
};

type PreviewItem = {
  questionId: string;
  code: string;
  area?: string;
  areaLabel?: string;
  todo?: string;
  prompt?: string;
};

type PreviewPayload = {
  surveyName: string;
  countyName: string;
  sourceRevision: number;
  items: PreviewItem[];
};

export default function NewLocalPlanForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { can, isAdmin } = useAccess();
  const { pushToast } = useToast();
  const canCreate = isAdmin || can('LOCALPLAN:CREATE', { classWideOnly: true });

  const [sheets, setSheets] = useState<AnswerRow[]>([]);
  const [responseId, setResponseId] = useState(search.get('responseId') || '');
  const [inclusionMode, setInclusionMode] = useState<InclusionMode>('gaps');
  const [sourceRevision, setSourceRevision] = useState<string>('');
  const [revisions, setRevisions] = useState<number[]>([]);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSheet = useMemo(
    () => sheets.find((row) => row._id === responseId) || null,
    [responseId, sheets]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet<{ items: AnswerRow[] }>('/surveys/answers');
        const approved = (data.items || []).filter(
          (row) => row.status === 'approved' && row.subjectType === 'COUNTY'
        );
        if (!cancelled) setSheets(approved);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load approved surveys.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSheet) {
      setRevisions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<RevisionList>(
          `/surveys/${selectedSheet.instrumentId}/subjects/${selectedSheet.subjectType}/${selectedSheet.subjectId}/revisions`
        );
        if (cancelled) return;
        const nums = (data.items || []).map((row) => row.revision);
        setRevisions(nums.length ? nums : [selectedSheet.revision]);
        setSourceRevision(String(data.currentRevision || selectedSheet.revision));
      } catch {
        if (!cancelled) {
          setRevisions([selectedSheet.revision]);
          setSourceRevision(String(selectedSheet.revision));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSheet]);

  const loadPreview = useCallback(async () => {
    if (!responseId) {
      setPreview(null);
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        instrumentResponseId: responseId,
        inclusionMode: inclusionMode === 'selected' ? 'all' : inclusionMode,
      });
      if (sourceRevision) params.set('sourceRevision', sourceRevision);
      const data = await apiGet<PreviewPayload>(`/localplans/preview?${params.toString()}`);
      setPreview(data);
      if (inclusionMode === 'gaps' || inclusionMode === 'all') {
        setSelected(new Set(data.items.map((item) => item.questionId)));
      }
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Failed to preview codes.');
    } finally {
      setPreviewing(false);
    }
  }, [inclusionMode, responseId, sourceRevision]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const toggleCode = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!responseId) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        instrumentResponseId: responseId,
        inclusionMode,
        sourceRevision: sourceRevision ? Number(sourceRevision) : undefined,
      };
      if (inclusionMode === 'selected') body.questionIds = [...selected];
      const created = await apiPost<{ _id: string }>('/localplans', body);
      pushToast({ tone: 'success', title: 'Local plan created', message: 'You can edit entries next.' });
      router.push(`/localplans/${created._id}`);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Create failed',
        message: err instanceof Error ? err.message : 'Could not create the local plan.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <p className="text-[var(--muted)]">You do not have permission to create local plans.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Local plans', href: '/localplans' },
            { label: 'New' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">New local plan</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Choose an approved county survey, then include gap codes (score 0), all codes, or a selection.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Approved county survey</span>
          <select
            required
            value={responseId}
            onChange={(event) => setResponseId(event.target.value)}
            disabled={loading}
            className="rounded-md border border-[var(--border)] px-3 py-2"
          >
            <option value="">{loading ? 'Loading…' : 'Select a sheet'}</option>
            {sheets.map((row) => (
              <option key={row._id} value={row._id}>
                {row.subjectLabel || row.subjectId} · {row.surveyName} (rev {row.revision})
              </option>
            ))}
          </select>
        </label>

        <label className="flex max-w-xs flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Survey revision</span>
          <select
            value={sourceRevision}
            onChange={(event) => setSourceRevision(event.target.value)}
            disabled={!responseId}
            className="rounded-md border border-[var(--border)] px-3 py-2"
          >
            {revisions.map((rev) => (
              <option key={rev} value={rev}>
                Revision {rev}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm text-[var(--muted)]">Codes to include</legend>
          {(
            [
              ['gaps', 'Gaps only (score 0)'],
              ['all', 'All codes'],
              ['selected', 'Selected codes'],
            ] as Array<[InclusionMode, string]>
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="inclusionMode"
                value={value}
                checked={inclusionMode === value}
                onChange={() => setInclusionMode(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--muted)]">
            {previewing
              ? 'Loading codes…'
              : preview
                ? `${preview.countyName} · ${preview.surveyName} · ${preview.items.length} code${
                    preview.items.length === 1 ? '' : 's'
                  }`
                : 'Select an approved sheet to preview codes.'}
          </p>
          {preview?.items.length ? (
            <ul className="mt-3 max-h-80 space-y-1 overflow-auto text-sm">
              {preview.items.map((item) => (
                <li key={item.questionId} className="flex items-start gap-2">
                  {inclusionMode === 'selected' ? (
                    <input
                      type="checkbox"
                      checked={selected.has(item.questionId)}
                      onChange={() => toggleCode(item.questionId)}
                    />
                  ) : null}
                  <span className="font-medium">{item.code}</span>
                  <span className="text-[var(--muted)]">{item.areaLabel || areaLabel(item.area)}</span>
                  <span>{item.todo || item.prompt}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/localplans')}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !responseId || (inclusionMode === 'selected' && selected.size === 0)}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create local plan'}
          </button>
        </div>
      </form>
    </div>
  );
}
