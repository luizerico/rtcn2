"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet, apiPut } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import SponsorForm, {
  sponsorFromRecord,
  type SponsorFormValue,
} from '@/components/funding/SponsorForm';
import { enumLabel, type SponsorRecord } from '@/lib/fundingTypes';

export default function SponsorDetailPage() {
  const params = useParams<{ id: string }>();
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canWrite = can('SPONSOR:WRITE', { resourceId: params.id });
  const [record, setRecord] = useState<SponsorRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<SponsorRecord>(`/sponsors/${params.id}`)
      .then((row) => {
        if (!cancelled) setRecord(row);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sponsor.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const handleSubmit = async (value: SponsorFormValue) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<SponsorRecord>(`/sponsors/${params.id}`, value);
      setRecord(updated);
      pushToast({ tone: 'success', title: 'Sponsor updated', message: updated.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update sponsor.';
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
            { label: 'Sponsors', href: '/sponsors' },
            { label: record?.name || 'Sponsor' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">{record?.name || 'Sponsor'}</h1>
      </header>
      {loading ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}
      {record && canWrite ? (
        <SponsorForm
          initial={sponsorFromRecord(record)}
          saving={saving}
          canSubmit={canWrite}
          submitLabel="Save changes"
          onSubmit={handleSubmit}
        />
      ) : null}
      {record && !canWrite ? (
        <dl className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--muted)]">Email</dt>
            <dd>{record.orgEmail}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Origin</dt>
            <dd>{enumLabel(record.origem || '')}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Contact</dt>
            <dd>{record.contact}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Phone</dt>
            <dd>{record.phone}</dd>
          </div>
        </dl>
      ) : null}
      <Link href="/sponsors" className="text-sm text-[var(--accent)] hover:underline">
        Back to sponsors
      </Link>
    </div>
  );
}
