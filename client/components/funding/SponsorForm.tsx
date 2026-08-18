"use client";

import { FormEvent, useState } from 'react';
import {
  SPONSOR_ORIGEM,
  enumLabel,
  type SponsorRecord,
} from '@/lib/fundingTypes';
import { Field, Select, TextArea, TextInput } from '@/components/funding/FormFields';

export interface SponsorFormValue {
  name: string;
  orgEmail: string;
  origem: string;
  orgUnit: string;
  webpage: string;
  email: string;
  socialMedia: string;
  contact: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  description: string;
  obs: string;
}

export function emptySponsorForm(): SponsorFormValue {
  return {
    name: '',
    orgEmail: '',
    origem: SPONSOR_ORIGEM[0],
    orgUnit: '',
    webpage: '',
    email: '',
    socialMedia: '',
    contact: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    description: '',
    obs: '',
  };
}

export function sponsorFromRecord(record: SponsorRecord): SponsorFormValue {
  return {
    name: record.name || '',
    orgEmail: record.orgEmail || '',
    origem: record.origem || SPONSOR_ORIGEM[0],
    orgUnit: record.orgUnit || '',
    webpage: record.webpage || '',
    email: record.email || '',
    socialMedia: record.socialMedia || '',
    contact: record.contact || '',
    phone: record.phone || '',
    address: record.address || '',
    city: record.city || '',
    state: record.state || '',
    zipCode: record.zipCode || '',
    country: record.country || '',
    description: record.description || '',
    obs: record.obs || '',
  };
}

export default function SponsorForm({
  initial,
  saving,
  canSubmit,
  submitLabel,
  onSubmit,
}: {
  initial?: SponsorFormValue;
  saving: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onSubmit: (value: SponsorFormValue) => Promise<void>;
}) {
  const [value, setValue] = useState<SponsorFormValue>(initial || emptySponsorForm());

  const patch = (partial: Partial<SponsorFormValue>) => {
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
        <Field label="Organization name">
          <TextInput
            required
            value={value.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field label="Organization email">
          <TextInput
            required
            type="email"
            value={value.orgEmail}
            onChange={(e) => patch({ orgEmail: e.target.value })}
          />
        </Field>
        <Field label="Origin">
          <Select
            required
            value={value.origem}
            onChange={(e) => patch({ origem: e.target.value })}
          >
            {SPONSOR_ORIGEM.map((item) => (
              <option key={item} value={item}>
                {enumLabel(item)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit">
          <TextInput value={value.orgUnit} onChange={(e) => patch({ orgUnit: e.target.value })} />
        </Field>
        <Field label="Contact">
          <TextInput
            required
            value={value.contact}
            onChange={(e) => patch({ contact: e.target.value })}
          />
        </Field>
        <Field label="Phone">
          <TextInput required value={value.phone} onChange={(e) => patch({ phone: e.target.value })} />
        </Field>
        <Field label="Webpage">
          <TextInput value={value.webpage} onChange={(e) => patch({ webpage: e.target.value })} />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            value={value.email}
            onChange={(e) => patch({ email: e.target.value })}
          />
        </Field>
        <Field label="Social media" className="sm:col-span-2">
          <TextInput
            value={value.socialMedia}
            onChange={(e) => patch({ socialMedia: e.target.value })}
          />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <TextInput value={value.address} onChange={(e) => patch({ address: e.target.value })} />
        </Field>
        <Field label="City">
          <TextInput value={value.city} onChange={(e) => patch({ city: e.target.value })} />
        </Field>
        <Field label="State">
          <TextInput value={value.state} onChange={(e) => patch({ state: e.target.value })} />
        </Field>
        <Field label="ZIP">
          <TextInput value={value.zipCode} onChange={(e) => patch({ zipCode: e.target.value })} />
        </Field>
        <Field label="Country">
          <TextInput value={value.country} onChange={(e) => patch({ country: e.target.value })} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <TextArea
            rows={3}
            value={value.description}
            onChange={(e) => patch({ description: e.target.value })}
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
