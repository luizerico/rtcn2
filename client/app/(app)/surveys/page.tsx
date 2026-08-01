"use client";

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet, apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';

type QuestionType = 'text' | 'multiple_choice' | 'yes_no';

interface QuestionDraft {
  key: string;
  prompt: string;
  type: QuestionType;
  optionsText: string;
  required: boolean;
}

interface SurveyRecord {
  _id: string;
  name: string;
  description?: string;
  questions: Array<{ questionId: string; prompt: string; type: QuestionType }>;
  createdAt?: string;
  createdBy?: { username?: string } | string;
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

export default function SurveysPage() {
  const { pushToast } = useToast();
  const [surveys, setSurveys] = useState<SurveyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);

  const loadSurveys = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<SurveyRecord[]>('/surveys');
      setSurveys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load surveys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSurveys();
  }, []);

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
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
      };

      await apiPost('/surveys', payload);
      pushToast({
        tone: 'success',
        title: 'Survey created',
        message: `${name} is ready to collect answers.`,
      });
      setName('');
      setDescription('');
      setQuestions([newQuestion()]);
      await loadSurveys();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create survey.';
      setError(message);
      pushToast({ tone: 'error', title: 'Create failed', message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/surveys/${id}`);
      pushToast({ tone: 'info', title: 'Survey deleted', message: 'Survey and responses removed.' });
      await loadSurveys();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Could not delete survey.',
      });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">Surveys</p>
        <h1 className="mt-2 text-3xl font-semibold">Create and manage surveys</h1>
        <p className="mt-2 text-[var(--muted)]">
          Surveys are Asset subclasses stored in the <code>assets</code> collection. Questions live in
          the separate <code>questions</code> collection (not assets). Question types: text, multiple
          choice, or yes/no.
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
        <h2 className="text-lg font-semibold">New survey</h2>
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
            Add question
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Create survey'}
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading surveys…</p>
        ) : surveys.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No surveys yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Questions</th>
                <th className="px-4 py-3 font-medium">Created by</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {surveys.map((survey) => (
                <tr key={survey._id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{survey.name}</div>
                    <div className="text-xs text-[var(--muted)]">{survey.description || '—'}</div>
                  </td>
                  <td className="px-4 py-3">{survey.questions?.length || 0}</td>
                  <td className="px-4 py-3">
                    {typeof survey.createdBy === 'object'
                      ? survey.createdBy?.username || '—'
                      : '—'}
                  </td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <Link href={`/surveys/${survey._id}`} className="text-[var(--accent)] hover:underline">
                      Answer
                    </Link>
                    <Link
                      href={`/surveys/${survey._id}/responses`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Results
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(survey._id)}
                      className="text-[var(--danger)] hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
