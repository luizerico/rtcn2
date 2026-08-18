"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet, apiPost, apiPut } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';
import { AccessLink } from '@/components/ui/AccessControls';
import SurveyQuestionEditor, {
  emptyQuestionDraft,
  questionFromApi,
  questionsToApiPayload,
  type QuestionType,
  type SurveyQuestionDraft,
} from '@/components/surveys/SurveyQuestionEditor';

interface SurveyQuestion {
  _id: string;
  questionId: string;
  code: string;
  area?: string;
  prompt: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
  evidence?: string;
  criteria?: string;
  maxPoints?: number;
  weight?: number;
  todo?: string;
}

interface SurveyVersion {
  _id: string;
  version: number;
  publishedAt?: string;
  active?: boolean;
}

interface Survey {
  _id: string;
  name: string;
  description?: string;
  instrumentType?: string;
  status?: string;
  currentVersion?: number | null;
  currentVersionId?: string | null;
  questions: SurveyQuestion[];
  versions?: SurveyVersion[];
}

export default function SurveyDesignerPage() {
  const params = useParams<{ id: string }>();
  const surveyId = params.id;
  const { pushToast } = useToast();
  const { can } = useAccess();
  const canWrite = can('SURVEY:WRITE', { resourceId: surveyId });

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestionDraft[]>([emptyQuestionDraft()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activatingVersion, setActivatingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapseToggleHost, setCollapseToggleHost] = useState<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Survey>(`/surveys/${surveyId}`);
      setSurvey(data);
      setName(data.name);
      setDescription(data.description || '');
      setQuestions(
        data.questions?.length ? data.questions.map(questionFromApi) : [emptyQuestionDraft()]
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load instrument.');
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDraft = async () => {
    await apiPut(`/surveys/${surveyId}`, {
      name,
      description,
      questions: questionsToApiPayload(questions),
    });
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveDraft();
      pushToast({ tone: 'success', title: 'Draft saved', message: 'Publish to freeze a new version.' });
      await load();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Could not save the instrument.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await saveDraft();
      await apiPost(`/surveys/${surveyId}/publish`);
      pushToast({ tone: 'success', title: 'Published', message: 'A new immutable version is live.' });
      await load();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Publish failed',
        message: err instanceof Error ? err.message : 'Could not publish.',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleActiveVersion = async (versionId: string) => {
    if (!canWrite || !versionId || versionId === survey?.currentVersionId) return;
    setActivatingVersion(true);
    try {
      const data = await apiPut<Survey>(`/surveys/${surveyId}/active-version`, { versionId });
      setSurvey((prev) =>
        prev
          ? {
              ...prev,
              currentVersion: data.currentVersion,
              currentVersionId: data.currentVersionId,
              versions: data.versions,
            }
          : data
      );
      const selected = data.versions?.find((row) => row._id === data.currentVersionId);
      pushToast({
        tone: 'success',
        title: 'Active version updated',
        message: `New counties will use v${selected?.version ?? data.currentVersion}. Assigned counties keep their own version.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Could not change active version',
        message: err instanceof Error ? err.message : 'Request failed.',
      });
    } finally {
      setActivatingVersion(false);
    }
  };

  if (loading) return <p className="text-[var(--muted)]">Loading instrument…</p>;
  if (error || !survey) {
    return (
      <div className="space-y-3">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Surveys', href: '/admin/surveys' },
            { label: 'Instrument' },
          ]}
        />
        <p className="text-red-700">{error || 'Instrument not found.'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Surveys', href: '/admin/surveys' },
            { label: survey.name },
          ]}
        />
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
          {survey.instrumentType === 'scored_diagnostic' ? 'Diagnostic' : 'Poll'}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{survey.name}</h1>
        <p className="mt-2 text-[var(--muted)]">
          Status {survey.status || 'draft'}
          {survey.currentVersion
            ? ` · default version: v${survey.currentVersion}`
            : ' · not published'}
          {survey.versions && survey.versions.length > 1
            ? ` (${survey.versions.length} published)`
            : ''}
          .{' '}
          <AccessLink allowed={can('SURVEY:READ', { resourceId: survey._id })} href={`/admin/surveys/${survey._id}/counties`}>
            Assign counties
          </AccessLink>
          .
        </p>
        <p className="mt-3 text-sm">
          <AccessLink allowed={can('SURVEY:READ', { resourceId: survey._id })} href={`/surveys/${survey._id}/responses`}>
            View sheets
          </AccessLink>
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
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
              disabled={!canWrite}
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
                disabled={!canWrite}
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] px-3 py-2"
              />
              <div ref={setCollapseToggleHost} className="shrink-0" />
            </div>
          </div>
        </div>

        {survey.versions && survey.versions.length > 0 ? (
          <div>
            <label htmlFor="survey-active-version" className="mb-1 block text-sm font-medium">
              Default version for new counties
            </label>
            <select
              id="survey-active-version"
              value={survey.currentVersionId || ''}
              onChange={(event) => void handleActiveVersion(event.target.value)}
              disabled={!canWrite || activatingVersion || survey.versions.length < 2}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 sm:max-w-md"
            >
              {survey.versions.map((row) => (
                <option key={row._id} value={row._id}>
                  {`v${row.version}${
                    row.publishedAt
                      ? ` · ${new Date(row.publishedAt).toLocaleString()}`
                      : ''
                  }${row._id === survey.currentVersionId ? ' (default)' : ''}`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Newly assigned counties use this snapshot. Set a different version per county on
              Assign counties. A county can only use one version.
            </p>
          </div>
        ) : null}

        <SurveyQuestionEditor
          questions={questions}
          onChange={setQuestions}
          disabled={!canWrite}
          collapseToggleHost={collapseToggleHost}
        />

        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href="/admin/surveys"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
          >
            Back
          </Link>
          <button
            type="submit"
            disabled={saving || !canWrite}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            disabled={publishing || !canWrite}
            onClick={() => void handlePublish()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {publishing ? 'Publishing…' : 'Publish version'}
          </button>
        </div>
      </form>
    </div>
  );
}
