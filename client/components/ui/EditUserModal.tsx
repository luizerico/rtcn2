"use client";

import React, { FormEvent, useEffect, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { apiGet, apiPut } from '@/lib/apiUtils';
import type { PaginatedList } from '@/lib/listTypes';

export type EditableUser = {
  _id: string;
  username: string;
  email: string;
  isVerified?: boolean;
  isEnabled?: boolean;
  language?: string | null;
  organization?: { _id: string; name: string } | null;
};

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: EditableUser | null;
  onSaved?: (user: { username: string }) => void;
}

interface OrgOption {
  _id: string;
  name: string;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user, onSaved }) => {
  const formId = useId();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [language, setLanguage] = useState('');
  const [isVerified, setIsVerified] = useState(true);
  const [isEnabled, setIsEnabled] = useState(true);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !user) {
      setUsername('');
      setEmail('');
      setOrganizationId('');
      setLanguage('');
      setIsVerified(true);
      setIsEnabled(true);
      setSaving(false);
      setError(null);
      return;
    }
    setUsername(user.username || '');
    setEmail(user.email || '');
    setOrganizationId(user.organization?._id || '');
    setLanguage(user.language || '');
    setIsVerified(user.isVerified !== false);
    setIsEnabled(user.isEnabled !== false);
    apiGet<PaginatedList<OrgOption>>('/organizations?limit=100&sort=name&order=asc')
      .then((result) => setOrgOptions(result.items || []))
      .catch(() => setOrgOptions([]));
  }, [isOpen, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/users/${user._id}`, {
        username,
        email,
        organization: organizationId || null,
        language,
        isVerified,
        isEnabled,
      });
      onSaved?.({ username });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit user" closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div>
          <label htmlFor={`${formId}-username`} className="mb-1 block text-sm font-medium">
            Username
          </label>
          <input
            id={`${formId}-username`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={64}
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor={`${formId}-org`} className="mb-1 block text-sm font-medium">
            Organization
          </label>
          <select
            id={`${formId}-org`}
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {orgOptions.map((org) => (
              <option key={org._id} value={org._id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${formId}-language`} className="mb-1 block text-sm font-medium">
            Language
          </label>
          <input
            id={`${formId}-language`}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            maxLength={10}
            placeholder="e.g. pt-BR"
            autoComplete="off"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isVerified}
              onChange={(e) => setIsVerified(e.target.checked)}
            />
            Verified
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
            />
            Enabled
          </label>
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
            disabled={saving || !user}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditUserModal;
