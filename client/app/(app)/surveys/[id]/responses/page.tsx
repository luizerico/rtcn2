"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

interface QuestionSummary {
  questionId: string;
  prompt: string;
  type: 'text' | 'multiple_choice' | 'yes_no';
  options?: string[];
  counts?: Record<string, number>;
  textAnswers?: Array<{
    responseId: string;
    value: string;
    respondent?: { username?: string } | string;
    submittedAt?: string;
  }>;
  totalAnswered: number;
}

interface ResponseRow {
  _id: string;
  createdAt?: string;
  createdBy?: { username?: string; email?: string } | string;
  answers: Array<{ questionId: string; value: string }>;
}

interface ResponsesPayload {
  survey: {
    _id: string;
    name: string;
    description?: string;
    questions: Array<{ questionId: string; prompt: string }>;
    createdBy?: { username?: string } | string;
    createdAt?: string;
    updatedAt?: string;
  };
  responses: ResponseRow[];
  summary: {
    responseCount: number;
    questions: QuestionSummary[];
  };
}

export default function SurveyResponsesPage() {
  const params = useParams<{ id: string }>();
  const surveyId = params.id;
  const [data, setData] = useState<ResponsesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const payload = await apiGet<ResponsesPayload>(`/surveys/${surveyId}/responses`);
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load responses.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [surveyId]);

  if (loading) {
    return <p className="text-[var(--muted)]">Loading results…</p>;
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Surveys', href: '/surveys' },
            { label: 'Results' },
          ]}
        />
        <p className="text-red-700">{error || 'Results unavailable.'}</p>
      </div>
    );
  }

  const { survey, responses, summary } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Surveys', href: '/surveys' },
            { label: survey.name, href: `/surveys/${survey._id}` },
            { label: 'Results' },
          ]}
        />
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
          Survey results
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{survey.name}</h1>
        <p className="mt-2 text-[var(--muted)]">
          {summary.responseCount} response{summary.responseCount === 1 ? '' : 's'} stored as
          SurveyResponse assets.
        </p>
        <p className="mt-3 text-sm">
          <Link href={`/surveys/${survey._id}`} className="text-[var(--accent)] hover:underline">
            Answer survey
          </Link>
        </p>
      </header>

      <section className="grid gap-4">
        {summary.questions.map((question) => (
          <article
            key={question.questionId}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <h2 className="text-lg font-semibold">{question.prompt}</h2>
            <p className="mt-1 text-xs uppercase tracking-wide text-[var(--muted)]">
              {question.type.replace('_', ' ')} · {question.totalAnswered} answered
            </p>

            {question.type === 'text' ? (
              <ul className="mt-4 space-y-2">
                {(question.textAnswers || []).length === 0 ? (
                  <li className="text-sm text-[var(--muted)]">No text answers yet.</li>
                ) : (
                  question.textAnswers?.map((row) => (
                    <li
                      key={`${row.responseId}-${row.value}`}
                      className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <p>{row.value}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {typeof row.respondent === 'object'
                          ? row.respondent?.username || 'Unknown'
                          : 'Unknown'}
                        {row.submittedAt ? ` · ${new Date(row.submittedAt).toLocaleString()}` : ''}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <ul className="mt-4 space-y-2">
                {Object.entries(question.counts || {}).map(([option, count]) => {
                  const pct =
                    question.totalAnswered > 0
                      ? Math.round((count / question.totalAnswered) * 100)
                      : 0;
                  return (
                    <li key={option}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{option}</span>
                        <span className="text-[var(--muted)]">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-[var(--accent-soft)]">
                        <div
                          className="h-full bg-[var(--accent)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-semibold">Individual responses</h2>
        </div>
        {responses.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No responses yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Respondent</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  {survey.questions.map((q) => (
                    <th key={q.questionId} className="px-4 py-3 font-medium">
                      {q.prompt}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {responses.map((response) => {
                  const byQuestion = new Map(
                    response.answers.map((a) => [a.questionId, String(a.value)])
                  );
                  return (
                    <tr key={response._id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-3">
                        {typeof response.createdBy === 'object'
                          ? response.createdBy?.username || '—'
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {response.createdAt
                          ? new Date(response.createdAt).toLocaleString()
                          : '—'}
                      </td>
                      {survey.questions.map((q) => (
                        <td key={q.questionId} className="px-4 py-3">
                          {byQuestion.get(q.questionId) || '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
