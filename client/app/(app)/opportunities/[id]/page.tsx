"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet, apiPut } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import OpportunityForm, {
  opportunityFromRecord,
  opportunityPayload,
  type OpportunityFormValue,
} from '@/components/funding/OpportunityForm';
import AttachedFilesPanel from '@/components/files/AttachedFilesPanel';
import { enumLabel, refName, type OpportunityRecord } from '@/lib/fundingTypes';

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canWrite = can('OPPORTUNITY:WRITE', { resourceId: params.id });
  const [record, setRecord] = useState<OpportunityRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<OpportunityRecord>(`/opportunities/${params.id}`)
      .then((row) => {
        if (!cancelled) setRecord(row);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load opportunity.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const handleSubmit = async (value: OpportunityFormValue) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<OpportunityRecord>(
        `/opportunities/${params.id}`,
        opportunityPayload(value)
      );
      setRecord(updated);
      pushToast({ tone: 'success', title: 'Opportunity updated', message: updated.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update opportunity.';
      setError(message);
      pushToast({ tone: 'error', title: 'Update failed', message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Opportunities', href: '/opportunities' },
            { label: record?.name || 'Opportunity' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">{record?.name || 'Opportunity'}</h1>
      </header>
      {loading ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}
      {record && canWrite ? (
        <OpportunityForm
          initial={opportunityFromRecord(record)}
          saving={saving}
          canSubmit={canWrite}
          submitLabel="Save changes"
          onSubmit={handleSubmit}
        />
      ) : null}
      {record && !canWrite ? (
        <dl className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--muted)]">Sponsor</dt>
            <dd>{refName(record.sponsor) || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Category</dt>
            <dd>{enumLabel(record.category || '')}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--muted)]">Description</dt>
            <dd>{record.description}</dd>
          </div>
        </dl>
      ) : null}
      {record ? (
        <AttachedFilesPanel
          listEndpoint={`/opportunities/${params.id}/files`}
          canWrite={canWrite}
          title="Attached files"
        />
      ) : null}
      <Link href="/opportunities" className="text-sm text-[var(--accent)] hover:underline">
        Back to opportunities
      </Link>
    </div>
  );
}
