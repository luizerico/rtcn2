"use client";

import React, { FormEvent, useEffect, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { apiPost, apiPut } from '@/lib/apiUtils';

export type OrganizationFormValues = {
  name: string;
  description?: string;
  website?: string;
  email?: string;
  phone?: string;
};

interface OrganizationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (org: OrganizationFormValues) => void;
  organization?: { _id: string } & OrganizationFormValues;
}

const EMPTY: OrganizationFormValues = {
  name: '',
  description: '',
  website: '',
  email: '',
  phone: '',
};

const OrganizationFormModal: React.FC<OrganizationFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  organization,
}) => {
  const formId = useId();
  const isEdit = Boolean(organization?._id);
  const [form, setForm] = useState<OrganizationFormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setForm(EMPTY);
      setSaving(false);
      setError(null);
      return;
    }
    if (organization) {
      setForm({
        name: organization.name || '',
        description: organization.description || '',
        website: organization.website || '',
        email: organization.email || '',
        phone: organization.phone || '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [isOpen, organization]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isEdit && organization) {
        await apiPut(`/organizations/${organization._id}`, form);
      } else {
        await apiPost('/organizations', form);
      }
      onSaved?.(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save organization.');
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof OrganizationFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit organization' : 'Create organization'}
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div>
          <label htmlFor={`${formId}-name`} className="mb-1 block text-sm font-medium">
            Organization name
          </label>
          <input
            id={`${formId}-name`}
            value={form.name}
            onChange={setField('name')}
            required
            minLength={2}
            maxLength={100}
            autoComplete="off"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor={`${formId}-description`} className="mb-1 block text-sm font-medium">
            Description
          </label>
          <input
            id={`${formId}-description`}
            value={form.description}
            onChange={setField('description')}
            maxLength={500}
            autoComplete="off"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor={`${formId}-website`} className="mb-1 block text-sm font-medium">
            Website
          </label>
          <input
            id={`${formId}-website`}
            value={form.website}
            onChange={setField('website')}
            autoComplete="off"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor={`${formId}-email`} className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id={`${formId}-email`}
            type="email"
            value={form.email}
            onChange={setField('email')}
            autoComplete="off"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor={`${formId}-phone`} className="mb-1 block text-sm font-medium">
            Phone
          </label>
          <input
            id={`${formId}-phone`}
            value={form.phone}
            onChange={setField('phone')}
            autoComplete="off"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create organization'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default OrganizationFormModal;
