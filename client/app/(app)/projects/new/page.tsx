"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import ProjectForm, { projectPayload, type ProjectFormValue } from '@/components/funding/ProjectForm';

export default function CreateProjectPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canCreate = can('PROJECT:CREATE', { classWideOnly: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    canCreate ? null : 'You do not have permission to create projects.'
  );

  const handleSubmit = async (value: ProjectFormValue) => {
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiPost<{ _id: string }>('/projects', projectPayload(value));
      pushToast({ tone: 'success', title: 'Project created', message: value.name });
      router.push(`/projects/${created._id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project.';
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
            { label: 'Projects', href: '/projects' },
            { label: 'Create' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Create project</h1>
        <p className="mt-2 text-[var(--muted)]">Record a project and optionally link it to an opportunity.</p>
      </header>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}
      <ProjectForm
        saving={saving}
        canSubmit={canCreate}
        submitLabel="Create project"
        onSubmit={handleSubmit}
      />
      <Link href="/projects" className="text-sm text-[var(--accent)] hover:underline">
        Back to projects
      </Link>
    </div>
  );
}
