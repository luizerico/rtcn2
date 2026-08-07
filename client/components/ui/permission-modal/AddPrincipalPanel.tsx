'use client';

import React from 'react';
import type { CatalogPrincipal, PrincipalType } from './types';

interface AddPrincipalPanelProps {
  addMode: PrincipalType;
  candidates: CatalogPrincipal[];
  onClose: () => void;
  onAdd: (principal: CatalogPrincipal) => void;
}

export function AddPrincipalPanel({
  addMode,
  candidates,
  onClose,
  onAdd,
}: AddPrincipalPanelProps) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Add {addMode === 'USER' ? 'user' : 'group'}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[var(--muted)] hover:underline"
        >
          Close
        </button>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {candidates.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No more {addMode === 'USER' ? 'users' : 'groups'} to add.
          </p>
        ) : (
          candidates.map((principal) => (
            <button
              key={principal.id}
              type="button"
              onClick={() => onAdd(principal)}
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--accent-soft)]"
            >
              {principal.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
