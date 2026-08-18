"use client";

import AttachedFilesPanel from '@/components/files/AttachedFilesPanel';
import { Modal } from '@/components/ui/Modal';
import type { StoredFileRecord } from '@/lib/storedFileTypes';

type QuestionFilesModalProps = {
  isOpen: boolean;
  title: string;
  listEndpoint: string;
  questionId: string;
  canWrite: boolean;
  sheetSaved: boolean;
  onClose: () => void;
  onItemsChange?: (items: StoredFileRecord[]) => void;
};

export default function QuestionFilesModal({
  isOpen,
  title,
  listEndpoint,
  questionId,
  canWrite,
  sheetSaved,
  onClose,
  onItemsChange,
}: QuestionFilesModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      {sheetSaved ? (
        <AttachedFilesPanel
          listEndpoint={listEndpoint}
          canWrite={canWrite}
          questionId={questionId}
          variant="plain"
          onItemsChange={onItemsChange}
        />
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Save the sheet once before attaching evidence files for this question.
        </p>
      )}
    </Modal>
  );
}
