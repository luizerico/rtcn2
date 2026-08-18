"use client";

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

type QuestionNotesModalProps = {
  isOpen: boolean;
  title: string;
  value: string;
  hint?: string;
  canWrite: boolean;
  onClose: () => void;
  onSave?: (value: string) => void;
};

export default function QuestionNotesModal({
  isOpen,
  title,
  value,
  hint,
  canWrite,
  onClose,
  onSave,
}: QuestionNotesModalProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (isOpen) setDraft(value);
  }, [isOpen, value]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg" closeOnBackdrop={false}>
      <div className="space-y-4">
        {hint ? <p className="text-sm text-[var(--muted)]">{hint}</p> : null}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={!canWrite}
          rows={8}
          maxLength={2000}
          placeholder="Notes (optional)"
          className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        />
        <p className="text-xs text-[var(--muted)]">
          {canWrite ? 'Notes are saved with the sheet.' : 'Notes are read-only on this view.'}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
          >
            {canWrite ? 'Cancel' : 'Close'}
          </button>
          {canWrite ? (
            <button
              type="button"
              onClick={() => onSave?.(draft)}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
            >
              Save notes
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
