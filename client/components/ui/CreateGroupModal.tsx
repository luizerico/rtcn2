"use client";

import React, { FormEvent, useEffect, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { apiPost } from '@/lib/apiUtils';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (group: { name: string; description?: string }) => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose, onCreated }) => {
  const formId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setSaving(false);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiPost('/groups', { name, description });
      onCreated?.({ name, description });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create group">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div>
          <label htmlFor={`${formId}-name`} className="mb-1 block text-sm font-medium">
            Group name
          </label>
          <input
            id={`${formId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            {saving ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateGroupModal;
