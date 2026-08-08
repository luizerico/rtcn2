"use client";

import React, { FormEvent, useEffect, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { apiPost } from '@/lib/apiUtils';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  onUpdated?: () => void;
}

/**
 * Admin-only dialog to reset another user's password without opening their profile.
 */
const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  userId,
  username,
  onUpdated,
}) => {
  const formId = useId();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNewPassword('');
      setConfirmPassword('');
      setSaving(false);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/users/${userId}/password`, { newPassword });
      onUpdated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Change password — ${username}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <div>
          <label htmlFor={`${formId}-new`} className="mb-1 block text-sm font-medium">
            New password
          </label>
          <input
            id={`${formId}-new`}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-confirm`} className="mb-1 block text-sm font-medium">
            Confirm password
          </label>
          <input
            id={`${formId}-confirm`}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
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
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ChangePasswordModal;
