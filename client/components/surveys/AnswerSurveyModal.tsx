"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/apiUtils';
import { Modal } from '@/components/ui/Modal';
import { useAccess } from '@/components/AccessProvider';
import type { PaginatedList } from '@/lib/listTypes';

type SurveyOption = {
  _id: string;
  name: string;
  instrumentType?: string;
  currentVersion?: number | null;
  countyIds?: string[];
};

type CountyOption = {
  _id: string;
  name: string;
  IBGECode?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AnswerSurveyModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const { can } = useAccess();
  const [step, setStep] = useState<'survey' | 'county'>('survey');
  const [surveyQuery, setSurveyQuery] = useState('');
  const [countyQuery, setCountyQuery] = useState('');
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [counties, setCounties] = useState<CountyOption[]>([]);
  const [selected, setSelected] = useState<SurveyOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('survey');
      setSurveyQuery('');
      setCountyQuery('');
      setSelected(null);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || step !== 'survey') return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: '25',
          sort: 'name',
          order: 'asc',
        });
        if (surveyQuery.trim()) params.set('search', surveyQuery.trim());
        const data = await apiGet<{ items: SurveyOption[] }>(`/surveys?${params.toString()}`);
        if (cancelled) return;
        const items = (data.items || []).filter(
          (row) =>
            Boolean(row.currentVersion) &&
            (row.countyIds || []).some((id) => can('COUNTY:CREATE', { resourceId: id }))
        );
        setSurveys(items);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load surveys.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [can, isOpen, step, surveyQuery]);

  useEffect(() => {
    if (!isOpen || step !== 'county' || !selected) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: '25',
          sort: 'name',
          order: 'asc',
        });
        if (countyQuery.trim()) params.set('search', countyQuery.trim());
        const data = await apiGet<PaginatedList<CountyOption>>(
          `/surveys/${selected._id}/answerable-counties?${params.toString()}`
        );
        if (!cancelled) setCounties(data.items || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load counties.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [countyQuery, isOpen, selected, step]);

  const pickCounty = (countyId: string) => {
    if (!selected) return;
    onClose();
    router.push(`/surveys/${selected._id}/subjects/COUNTY/${countyId}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 'survey' ? 'Answer a survey' : 'Choose a county'}
      size="lg"
    >
      <div className="space-y-4">
        {step === 'county' ? (
          <button
            type="button"
            onClick={() => {
              setStep('survey');
              setCountyQuery('');
            }}
            className="text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Back to surveys
          </button>
        ) : null}
        <p className="text-sm text-[var(--muted)]">
          {step === 'survey'
            ? 'Choose a published survey you can read. Results load as you search.'
            : `Counties assigned to ${selected?.name || 'this survey'} that you can start answering.`}
        </p>
        <input
          value={step === 'survey' ? surveyQuery : countyQuery}
          onChange={(e) =>
            step === 'survey' ? setSurveyQuery(e.target.value) : setCountyQuery(e.target.value)
          }
          placeholder={step === 'survey' ? 'Search surveys…' : 'Search counties…'}
          className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Searching…</p>
        ) : step === 'survey' ? (
          surveys.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No surveys you can start right now.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-[var(--border)] overflow-auto rounded-md border border-[var(--border)]">
              {surveys.map((row) => (
                <li key={row._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(row);
                      setStep('county');
                    }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)]"
                  >
                    <span className="font-medium">{row.name}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {row.instrumentType === 'scored_diagnostic' ? 'Diagnostic' : 'Poll'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : counties.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No assigned counties you can start for this survey.
          </p>
        ) : (
          <ul className="max-h-64 divide-y divide-[var(--border)] overflow-auto rounded-md border border-[var(--border)]">
            {counties.map((row) => (
              <li key={row._id}>
                <button
                  type="button"
                  onClick={() => pickCounty(row._id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)]"
                >
                  <span>{row.name}</span>
                  {row.IBGECode ? (
                    <span className="text-xs text-[var(--muted)]">{row.IBGECode}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
