"use client";

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import { AccessLink } from '@/components/ui/AccessControls';

type QuestionType = 'text' | 'multiple_choice' | 'yes_no';

interface Question {
  questionId: string;
  prompt: string;
  type: QuestionType;
  options: string[];
  required: boolean;
}

interface Survey {
  _id: string;
  name: string;
  description?: string;
  questions: Question[];
}

export default function TakeSurveyPage() {
  const params = useParams<{ id: string }>();
  const surveyId = params.id;
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canSubmit = can('SURVEY_RESPONSE:CREATE', { classWideOnly: true });
  const canViewResults = can('SURVEY_RESPONSE:READ', { allowAnyInstance: true });

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiGet<Survey>(`/surveys/${surveyId}`);
        setSurvey(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load survey.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [surveyId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!survey) return;
    setSaving(true);
    try {
      await apiPost(`/surveys/${survey._id}/responses`, {
        answers: survey.questions.map((q) => ({
          questionId: q.questionId,
          value: answers[q.questionId] ?? '',
        })),
      });
      pushToast({
        tone: 'success',
        title: 'Response saved',
        message: 'Your answers were stored as a SurveyResponse asset.',
      });
      setAnswers({});
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Submit failed',
        message: err instanceof Error ? err.message : 'Could not save response.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-[var(--muted)]">Loading survey…</p>;
  }

  if (error || !survey) {
    return (
      <div className="space-y-3">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Surveys', href: '/surveys' },
            { label: 'Survey' },
          ]}
        />
        <p className="text-red-700">{error || 'Survey not found.'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Surveys', href: '/surveys' },
            { label: survey.name },
          ]}
        />
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">Survey</p>
        <h1 className="mt-2 text-3xl font-semibold">{survey.name}</h1>
        <p className="mt-2 text-[var(--muted)]">{survey.description || 'Answer each question below.'}</p>
        <p className="mt-3 text-sm">
          <AccessLink allowed={canViewResults} href={`/surveys/${survey._id}/responses`}>
            View results
          </AccessLink>
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        {!canSubmit ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You can view this survey but do not have permission to submit answers.
          </p>
        ) : null}        {survey.questions.map((question, index) => (
          <fieldset key={question.questionId} className="space-y-2">
            <legend className="text-sm font-medium">
              {index + 1}. {question.prompt}
              {question.required ? ' *' : ''}
            </legend>

            {question.type === 'text' && (
              <textarea
                value={answers[question.questionId] || ''}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [question.questionId]: e.target.value }))
                }
                required={question.required}
                rows={3}
                className="w-full rounded-md border border-[var(--border)] px-3 py-2"
              />
            )}

            {question.type === 'yes_no' && (
              <div className="flex gap-4">
                {['Yes', 'No'].map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={question.questionId}
                      value={option}
                      checked={answers[question.questionId] === option}
                      onChange={() =>
                        setAnswers((prev) => ({ ...prev, [question.questionId]: option }))
                      }
                      required={question.required}
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}

            {question.type === 'multiple_choice' && (
              <div className="space-y-2">
                {question.options.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={question.questionId}
                      value={option}
                      checked={answers[question.questionId] === option}
                      onChange={() =>
                        setAnswers((prev) => ({ ...prev, [question.questionId]: option }))
                      }
                      required={question.required}
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        ))}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/surveys"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            title={!canSubmit ? 'You do not have permission to submit answers.' : undefined}
            className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Submitting…' : 'Submit answers'}
          </button>
        </div>
      </form>
    </div>
  );
}
