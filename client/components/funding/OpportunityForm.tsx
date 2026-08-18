"use client";

import { FormEvent, useEffect, useState } from 'react';
import { apiGet } from '@/lib/apiUtils';
import {
  DEFAULT_CURRENCY,
  OPPORTUNITY_CATEGORY,
  OPPORTUNITY_ELIGIBILITY,
  OPPORTUNITY_TYPE,
  enumLabel,
  type FundingListResponse,
  type OpportunityRecord,
  type SponsorRecord,
} from '@/lib/fundingTypes';
import { Field, Select, TextArea, TextInput } from '@/components/funding/FormFields';

export interface OpportunityFormValue {
  name: string;
  description: string;
  sponsor: string;
  type: string;
  category: string;
  eligibility: string;
  website: string;
  submissionMethod: string;
  startDate: string;
  endDate: string;
  continuous: boolean;
  budget: string;
  totalBudget: string;
  currency: string;
  obs: string;
  documents: string;
}

export function emptyOpportunityForm(): OpportunityFormValue {
  return {
    name: '',
    description: '',
    sponsor: '',
    type: OPPORTUNITY_TYPE[0],
    category: OPPORTUNITY_CATEGORY[0],
    eligibility: OPPORTUNITY_ELIGIBILITY[0],
    website: '',
    submissionMethod: '',
    startDate: '',
    endDate: '',
    continuous: false,
    budget: '',
    totalBudget: '',
    currency: DEFAULT_CURRENCY,
    obs: '',
    documents: '',
  };
}

export function opportunityFromRecord(record: OpportunityRecord): OpportunityFormValue {
  const sponsorId = typeof record.sponsor === 'string' ? record.sponsor : record.sponsor?._id || '';
  return {
    name: record.name || '',
    description: record.description || '',
    sponsor: sponsorId,
    type: record.type || OPPORTUNITY_TYPE[0],
    category: record.category || OPPORTUNITY_CATEGORY[0],
    eligibility: record.eligibility || OPPORTUNITY_ELIGIBILITY[0],
    website: record.website || '',
    submissionMethod: record.submissionMethod || '',
    startDate: record.startDate ? record.startDate.slice(0, 10) : '',
    endDate: record.endDate ? record.endDate.slice(0, 10) : '',
    continuous: Boolean(record.continuous),
    budget: record.budget == null ? '' : String(record.budget),
    totalBudget: record.totalBudget == null ? '' : String(record.totalBudget),
    currency: record.currency || DEFAULT_CURRENCY,
    obs: (record.obs || []).join('\n'),
    documents: (record.documents || []).join('\n'),
  };
}

export function opportunityPayload(value: OpportunityFormValue) {
  return {
    name: value.name,
    description: value.description,
    sponsor: value.sponsor,
    type: value.type,
    category: value.category,
    eligibility: value.eligibility,
    website: value.website,
    submissionMethod: value.submissionMethod,
    startDate: value.startDate,
    endDate: value.continuous || !value.endDate ? null : value.endDate,
    continuous: value.continuous,
    budget: Number(value.budget),
    totalBudget: value.totalBudget === '' ? null : Number(value.totalBudget),
    currency: value.currency,
    obs: value.obs,
    documents: value.documents,
  };
}

export default function OpportunityForm({
  initial,
  saving,
  canSubmit,
  submitLabel,
  onSubmit,
}: {
  initial?: OpportunityFormValue;
  saving: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onSubmit: (value: OpportunityFormValue) => Promise<void>;
}) {
  const [value, setValue] = useState<OpportunityFormValue>(initial || emptyOpportunityForm());
  const [sponsors, setSponsors] = useState<SponsorRecord[]>([]);

  useEffect(() => {
    apiGet<FundingListResponse<SponsorRecord>>('/sponsors?limit=100&sort=name&order=asc')
      .then((res) => setSponsors(res.items || []))
      .catch(() => setSponsors([]));
  }, []);

  const patch = (partial: Partial<OpportunityFormValue>) => {
    setValue((prev) => ({ ...prev, ...partial }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(value);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <TextInput required value={value.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label="Sponsor" className="sm:col-span-2">
          <Select
            required
            value={value.sponsor}
            onChange={(e) => patch({ sponsor: e.target.value })}
          >
            <option value="">Select a sponsor</option>
            {sponsors.map((sponsor) => (
              <option key={sponsor._id} value={sponsor._id}>
                {sponsor.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select required value={value.type} onChange={(e) => patch({ type: e.target.value })}>
            {OPPORTUNITY_TYPE.map((item) => (
              <option key={item} value={item}>
                {enumLabel(item)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select
            required
            value={value.category}
            onChange={(e) => patch({ category: e.target.value })}
          >
            {OPPORTUNITY_CATEGORY.map((item) => (
              <option key={item} value={item}>
                {enumLabel(item)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Eligibility" className="sm:col-span-2">
          <Select
            required
            value={value.eligibility}
            onChange={(e) => patch({ eligibility: e.target.value })}
          >
            {OPPORTUNITY_ELIGIBILITY.map((item) => (
              <option key={item} value={item}>
                {enumLabel(item)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website">
          <TextInput
            required
            value={value.website}
            onChange={(e) => patch({ website: e.target.value })}
          />
        </Field>
        <Field label="Submission method">
          <TextInput
            required
            value={value.submissionMethod}
            onChange={(e) => patch({ submissionMethod: e.target.value })}
          />
        </Field>
        <Field label="Start date">
          <TextInput
            required
            type="date"
            value={value.startDate}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
        </Field>
        <Field label="End date">
          <TextInput
            type="date"
            disabled={value.continuous}
            value={value.endDate}
            onChange={(e) => patch({ endDate: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={value.continuous}
            onChange={(e) => patch({ continuous: e.target.checked, endDate: e.target.checked ? '' : value.endDate })}
          />
          Continuous (no end date)
        </label>
        <Field label="Budget">
          <TextInput
            required
            type="number"
            step="0.01"
            value={value.budget}
            onChange={(e) => patch({ budget: e.target.value })}
          />
        </Field>
        <Field label="Total budget">
          <TextInput
            type="number"
            step="0.01"
            value={value.totalBudget}
            onChange={(e) => patch({ totalBudget: e.target.value })}
          />
        </Field>
        <Field label="Currency">
          <TextInput value={value.currency} onChange={(e) => patch({ currency: e.target.value })} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <TextArea
            required
            rows={3}
            value={value.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>
        <Field label="Notes (one per line)" className="sm:col-span-2">
          <TextArea rows={2} value={value.obs} onChange={(e) => patch({ obs: e.target.value })} />
        </Field>
        <Field label="Documents (one per line)" className="sm:col-span-2">
          <TextArea
            rows={2}
            value={value.documents}
            onChange={(e) => patch({ documents: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end">
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
