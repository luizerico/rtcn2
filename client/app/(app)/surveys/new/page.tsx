"use client";

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';

type QuestionType = 'text' | 'multiple_choice' | 'yes_no';

interface QuestionDraft {
  key: string;
  prompt: string;
  type: QuestionType;
  optionsText: string;
  required: boolean;
}

function newQuestion(): QuestionDraft {
  return {
    key: crypto.randomUUID(),
    prompt: '',
    type: 'text',
    optionsText: '',
    required: true,
  };
}

export default function CreateSurveyPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canCreate = can('SURVEY:CREATE', { classWideOnly: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);

  useEffect(() => {
    if (!canCreate) {
      setError('You do not have permission to create surveys.');
    }
  }, [canCreate]);

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  };

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
        questions: questions.map((q) => ({
          prompt: q.prompt,
          type: q.type,
          required: q.required,
          options:
            q.type === 'multiple_choice'
              ? q.optionsText
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
              : undefined,
        })),
      });

      pushToast({
        tone: 'success',
        title: 'Survey created',
        message: `${name} is ready to collect answers.`,
      });
      router.push(`/surveys/${created._id}`);
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
            { label: 'Surveys', href: '/surveys' },
            { label: 'Create' },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">Create survey</h1>
        <p className="mt-2 text-[var(--muted)]">
          Add a name and one or more questions (text, multiple choice, or yes/no).
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Survey name"
            required
            className="rounded-md border border-[var(--border)] px-3 py-2"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="rounded-md border border-[var(--border)] px-3 py-2"
          />
        </div>

        <div className="space-y-4">
          {questions.map((question, index) => (
            <div key={question.key} className="rounded-lg border border-[var(--border)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Question {index + 1}</p>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setQuestions((prev) => prev.filter((q) => q.key !== question.key))}
                    className="text-sm text-[var(--danger)] hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <input
                  value={question.prompt}
                  onChange={(e) => updateQuestion(question.key, { prompt: e.target.value })}
                  placeholder="Question prompt"
                  required
                  className="rounded-md border border-[var(--border)] px-3 py-2"
                />
                <select
                  value={question.type}
                  onChange={(e) =>
                    updateQuestion(question.key, { type: e.target.value as QuestionType })
                  }
                  className="rounded-md border border-[var(--border)] px-3 py-2"
                >
                  <option value="text">Text</option>
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="yes_no">Yes / No</option>
                </select>
              </div>

              {question.type === 'multiple_choice' && (
                <textarea
                  value={question.optionsText}
                  onChange={(e) => updateQuestion(question.key, { optionsText: e.target.value })}
                  placeholder="One option per line"
                  required
                  rows={3}
                  className="mt-3 w-full rounded-md border border-[var(--border)] px-3 py-2"
                />
              )}

              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={question.required}
                  onChange={(e) => updateQuestion(question.key, { required: e.target.checked })}
                />
                Required
              </label>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setQuestions((prev) => [...prev, newQuestion()])}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
          >
            Create question
          </button>
          <Link
            href="/surveys"
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
