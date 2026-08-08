"use client";

import React from 'react';
import { Modal } from '@/components/ui/Modal';

export interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  /** What is being deleted, shown in the body (e.g. username or survey name). */
  itemLabel?: string;
  description?: string;
  confirmLabel?: string;
  busy?: boolean;
}

/**
 * Required confirmation before any record delete/remove.
 */
export const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm delete',
  itemLabel,
  description,
  confirmLabel = 'Delete',
  busy = false,
}) => {
  const body =
    description ||
    (itemLabel
      ? `Delete “${itemLabel}”? This cannot be undone.`
      : 'Delete this record? This cannot be undone.');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">{body}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void onConfirm();
            }}
            disabled={busy}
            className="rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDeleteDialog;
