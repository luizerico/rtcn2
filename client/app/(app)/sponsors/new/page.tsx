"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import SponsorForm, { type SponsorFormValue } from '@/components/funding/SponsorForm';

export default function CreateSponsorPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canCreate = can('SPONSOR:CREATE', { classWideOnly: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(canCreate ? null : 'You do not have permission to create sponsors.');

  const handleSubmit = async (value: SponsorFormValue) => {
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiPost<{ _id: string }>('/sponsors', value);
      pushToast({ tone: 'success', title: 'Sponsor created', message: value.name });
      router.push(`/sponsors/${created._id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create sponsor.';
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
            { label: 'Sponsors', href: '/sponsors' },
            { label: 'Create' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Create sponsor</h1>
        <p className="mt-2 text-[var(--muted)]">Add an organization that funds or hosts opportunities.</p>
      </header>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}
      <SponsorForm
        saving={saving}
        canSubmit={canCreate}
        submitLabel="Create sponsor"
        onSubmit={handleSubmit}
      />
      <Link href="/sponsors" className="text-sm text-[var(--accent)] hover:underline">
        Back to sponsors
      </Link>
    </div>
  );
}
