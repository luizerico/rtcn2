"use client";

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import SurveyQuestionEditor, {
  emptyQuestionDraft,
  questionsToApiPayload,
  type SurveyQuestionDraft,
} from '@/components/surveys/SurveyQuestionEditor';

export default function CreateSurveyPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canCreate = can('SURVEY:CREATE', { classWideOnly: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instrumentType, setInstrumentType] = useState<'poll' | 'scored_diagnostic'>('poll');
  const [questions, setQuestions] = useState<SurveyQuestionDraft[]>([emptyQuestionDraft()]);
  const [collapseToggleHost, setCollapseToggleHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!canCreate) {
      setError('You do not have permission to create surveys.');
    }
  }, [canCreate]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      setError('You do not have permission to create surveys.');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const created = await apiPost<{ _id: string }>('/surveys', {
        name,
        description,
        instrumentType,
        questions: questionsToApiPayload(questions),
      });

      pushToast({
        tone: 'success',
        title: 'Survey created',
        message: `${name} is ready to collect answers.`,
      });
      router.push(`/admin/surveys/${created._id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create survey.';
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
            { label: 'Admin', href: '/admin' },
            { label: 'Surveys', href: '/admin/surveys' },
            { label: 'Create' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Create survey</h1>
        <p className="mt-2 text-[var(--muted)]">
          Add a name and questions, then publish a frozen version. Filling happens on a county or asset.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="survey-name" className="mb-1 block text-sm font-medium">
              Name
            </label>
            <input
              id="survey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="survey-description" className="mb-1 block text-sm font-medium">
              Description
            </label>
            <div className="flex items-center gap-2">
              <input
                id="survey-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] px-3 py-2"
              />
              <div ref={setCollapseToggleHost} className="shrink-0" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="survey-instrument-type" className="mb-1 block text-sm font-medium">
              Instrument type
            </label>
            <select
              id="survey-instrument-type"
              value={instrumentType}
              onChange={(e) => setInstrumentType(e.target.value as 'poll' | 'scored_diagnostic')}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            >
              <option value="poll">Poll</option>
              <option value="scored_diagnostic">Scored diagnostic</option>
            </select>
          </div>
        </div>

        <SurveyQuestionEditor
          questions={questions}
          onChange={setQuestions}
          disabled={!canCreate}
          collapseToggleHost={collapseToggleHost}
        />

        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href="/admin/surveys"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !canCreate}
            title={!canCreate ? 'You do not have permission to create surveys.' : undefined}
            className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Create survey'}
          </button>
        </div>
      </form>
    </div>
  );
}
