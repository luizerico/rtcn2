"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import OpportunityForm, {
  opportunityPayload,
  type OpportunityFormValue,
} from '@/components/funding/OpportunityForm';

export default function CreateOpportunityPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canCreate = can('OPPORTUNITY:CREATE', { classWideOnly: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    canCreate ? null : 'You do not have permission to create opportunities.'
  );

  const handleSubmit = async (value: OpportunityFormValue) => {
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiPost<{ _id: string }>('/opportunities', opportunityPayload(value));
      pushToast({ tone: 'success', title: 'Opportunity created', message: value.name });
      router.push(`/opportunities/${created._id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create opportunity.';
      setError(message);
      pushToast({ tone: 'error', title: 'Create failed', message });
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
            { label: 'Create' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Create opportunity</h1>
        <p className="mt-2 text-[var(--muted)]">Link a funding call or similar opportunity to a sponsor.</p>
      </header>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}
      <OpportunityForm
        saving={saving}
        canSubmit={canCreate}
        submitLabel="Create opportunity"
        onSubmit={handleSubmit}
      />
      <Link href="/opportunities" className="text-sm text-[var(--accent)] hover:underline">
        Back to opportunities
      </Link>
    </div>
  );
}
