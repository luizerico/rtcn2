"use client";

import { FormEvent, useEffect, useState } from 'react';
import { apiGet } from '@/lib/apiUtils';
import {
  DEFAULT_CURRENCY,
  PROJECT_STATUSES,
  RELATED_ENTITY_TYPES,
  enumLabel,
  refId,
  type FundingListResponse,
  type GeoOption,
  type OpportunityRecord,
  type ProjectRecord,
} from '@/lib/fundingTypes';
import { Field, Select, TextArea, TextInput } from '@/components/funding/FormFields';

interface GeoListResponse {
  items: GeoOption[];
}

const GEO_ENDPOINTS: Record<string, string> = {
  county: '/counties',
  state: '/states',
  biome: '/biomes',
  region: '/regions',
  microregion: '/microregions',
};

export interface ProjectFormValue {
  name: string;
  description: string;
  opportunity: string;
  entityType: string;
  entityId: string;
  projWebsite: string;
  projStartDate: string;
  projEndDate: string;
  projBudget: string;
  currency: string;
  projStatus: string;
  projComments: string;
  projDocuments: string;
  obs: string;
}

export function emptyProjectForm(): ProjectFormValue {
  return {
    name: '',
    description: '',
    opportunity: '',
    entityType: '',
    entityId: '',
    projWebsite: '',
    projStartDate: '',
    projEndDate: '',
    projBudget: '',
    currency: DEFAULT_CURRENCY,
    projStatus: PROJECT_STATUSES[1],
    projComments: '',
    projDocuments: '',
    obs: '',
  };
}

export function projectFromRecord(record: ProjectRecord): ProjectFormValue {
  return {
    name: record.name || '',
    description: record.description || '',
    opportunity: refId(record.opportunity),
    entityType: record.relatedEntity?.entityType || '',
    entityId: (() => {
      const first = record.relatedEntity?.entityId?.[0];
      if (!first) return '';
      if (typeof first === 'object' && first && '_id' in first) {
        return String((first as { _id: string })._id);
      }
      return String(first);
    })(),
    projWebsite: record.projWebsite || '',
    projStartDate: record.projStartDate ? record.projStartDate.slice(0, 10) : '',
    projEndDate: record.projEndDate ? record.projEndDate.slice(0, 10) : '',
    projBudget: record.projBudget == null ? '' : String(record.projBudget),
    currency: record.currency || DEFAULT_CURRENCY,
    projStatus: record.projStatus || PROJECT_STATUSES[1],
    projComments: (record.projComments || []).join('\n'),
    projDocuments: (record.projDocuments || []).join('\n'),
    obs: record.obs || '',
  };
}

export function projectPayload(value: ProjectFormValue) {
  return {
    name: value.name,
    description: value.description,
    opportunity: value.opportunity || null,
    relatedEntity: value.entityType
      ? {
          entityType: value.entityType,
          entityId: value.entityId ? [value.entityId] : [],
        }
      : null,
    projWebsite: value.projWebsite,
    projStartDate: value.projStartDate,
    projEndDate: value.projEndDate || null,
    projBudget: Number(value.projBudget),
    currency: value.currency,
    projStatus: value.projStatus,
    projComments: value.projComments,
    projDocuments: value.projDocuments,
    obs: value.obs,
  };
}

export default function ProjectForm({
  initial,
  saving,
  canSubmit,
  submitLabel,
  onSubmit,
}: {
  initial?: ProjectFormValue;
  saving: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onSubmit: (value: ProjectFormValue) => Promise<void>;
}) {
  const [value, setValue] = useState<ProjectFormValue>(initial || emptyProjectForm());
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>([]);
  const [geoOptions, setGeoOptions] = useState<GeoOption[]>([]);

  useEffect(() => {
    apiGet<FundingListResponse<OpportunityRecord>>('/opportunities?limit=100&sort=name&order=asc')
      .then((res) => setOpportunities(res.items || []))
      .catch(() => setOpportunities([]));
  }, []);

  useEffect(() => {
    if (!value.entityType) {
      setGeoOptions([]);
      return;
    }
    const endpoint = GEO_ENDPOINTS[value.entityType];
    if (!endpoint) return;
    apiGet<GeoListResponse>(`${endpoint}?limit=100&sort=name&order=asc`)
      .then((res) => setGeoOptions(res.items || []))
      .catch(() => setGeoOptions([]));
  }, [value.entityType]);

  const patch = (partial: Partial<ProjectFormValue>) => {
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
        <Field label="Opportunity" className="sm:col-span-2">
          <Select
            value={value.opportunity}
            onChange={(e) => patch({ opportunity: e.target.value })}
          >
            <option value="">None</option>
            {opportunities.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Related geography type">
          <Select
            value={value.entityType}
            onChange={(e) => patch({ entityType: e.target.value, entityId: '' })}
          >
            <option value="">None</option>
            {RELATED_ENTITY_TYPES.map((item) => (
              <option key={item} value={item}>
                {enumLabel(item)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Related geography">
          <Select
            disabled={!value.entityType}
            value={value.entityId}
            onChange={(e) => patch({ entityId: e.target.value })}
          >
            <option value="">Select…</option>
            {geoOptions.map((item) => (
              <option key={item._id} value={item._id}>
                {item.code ? `${item.code} · ${item.name}` : item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website" className="sm:col-span-2">
          <TextInput
            required
            value={value.projWebsite}
            onChange={(e) => patch({ projWebsite: e.target.value })}
          />
        </Field>
        <Field label="Start date">
          <TextInput
            required
            type="date"
            value={value.projStartDate}
            onChange={(e) => patch({ projStartDate: e.target.value })}
          />
        </Field>
        <Field label="End date">
          <TextInput
            type="date"
            value={value.projEndDate}
            onChange={(e) => patch({ projEndDate: e.target.value })}
          />
        </Field>
        <Field label="Budget">
          <TextInput
            required
            type="number"
            step="0.01"
            value={value.projBudget}
            onChange={(e) => patch({ projBudget: e.target.value })}
          />
        </Field>
        <Field label="Currency">
          <TextInput value={value.currency} onChange={(e) => patch({ currency: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select
            required
            value={value.projStatus}
            onChange={(e) => patch({ projStatus: e.target.value })}
          >
            {PROJECT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {enumLabel(item)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <TextArea
            required
            rows={3}
            value={value.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>
        <Field label="Comments (one per line)" className="sm:col-span-2">
          <TextArea
            rows={2}
            value={value.projComments}
            onChange={(e) => patch({ projComments: e.target.value })}
          />
        </Field>
        <Field label="Documents (one per line)" className="sm:col-span-2">
          <TextArea
            rows={2}
            value={value.projDocuments}
            onChange={(e) => patch({ projDocuments: e.target.value })}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <TextArea rows={2} value={value.obs} onChange={(e) => patch({ obs: e.target.value })} />
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
