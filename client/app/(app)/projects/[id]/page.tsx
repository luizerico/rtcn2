"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet, apiPut } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import ProjectForm, {
  projectFromRecord,
  projectPayload,
  type ProjectFormValue,
} from '@/components/funding/ProjectForm';
import { enumLabel, refName, type ProjectRecord } from '@/lib/fundingTypes';

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canWrite = can('PROJECT:WRITE', { resourceId: params.id });
  const [record, setRecord] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<ProjectRecord>(`/projects/${params.id}`)
      .then((row) => {
        if (!cancelled) setRecord(row);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load project.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const handleSubmit = async (value: ProjectFormValue) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<ProjectRecord>(`/projects/${params.id}`, projectPayload(value));
      setRecord(updated);
      pushToast({ tone: 'success', title: 'Project updated', message: updated.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update project.';
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
            { label: 'Projects', href: '/projects' },
            { label: record?.name || 'Project' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">{record?.name || 'Project'}</h1>
      </header>
      {loading ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}
      {record && canWrite ? (
        <ProjectForm
          initial={projectFromRecord(record)}
          saving={saving}
          canSubmit={canWrite}
          submitLabel="Save changes"
          onSubmit={handleSubmit}
        />
      ) : null}
      {record && !canWrite ? (
        <dl className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--muted)]">Opportunity</dt>
            <dd>{refName(record.opportunity) || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Status</dt>
            <dd>{enumLabel(record.projStatus || '')}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--muted)]">Description</dt>
            <dd>{record.description}</dd>
          </div>
        </dl>
      ) : null}
      <Link href="/projects" className="text-sm text-[var(--accent)] hover:underline">
        Back to projects
      </Link>
    </div>
  );
}
