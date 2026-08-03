'use client';

import React from 'react';
import type { AclEntry } from './types';

interface PrincipalListProps {
  entries: AclEntry[];
  selectedPrincipalKey: string | null;
  canAdd: boolean;
  onSelect: (entry: AclEntry) => void;
  onAddUser: () => void;
  onAddGroup: () => void;
  onRemove: () => void;
}

export function PrincipalList({
  entries,
  selectedPrincipalKey,
  canAdd,
  onSelect,
  onAddUser,
  onAddGroup,
  onRemove,
}: PrincipalListProps) {
  return (
    <div>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm font-medium">Group or user names</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddUser}
            disabled={!canAdd}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            Add user…
          </button>
          <button
            type="button"
            onClick={onAddGroup}
            disabled={!canAdd}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            Add group…
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={!selectedPrincipalKey}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>
      <ul
        className="min-h-[10rem] max-h-48 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--background)]"
        role="listbox"
        aria-label="Principals"
      >
        {entries.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">
            No users or groups assigned yet.
          </li>
        ) : (
          entries.map((entry) => {
            const key = `${entry.principalType}:${entry.principalId}`;
            const selected = key === selectedPrincipalKey;
            return (
              <li key={key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(entry)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]/50'
                  }`}
                >
                  <span className="font-medium">{entry.principalName}</span>
                  <span className="text-xs uppercase text-[var(--muted)]">
                    {entry.principalType === 'USER' ? 'User' : 'Group'}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
