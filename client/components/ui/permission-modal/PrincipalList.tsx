'use client';

import React, { useMemo, useState } from 'react';
import type { AclEntry } from './types';

function principalKey(entry: AclEntry) {
  return `${entry.principalType}:${entry.principalId}`;
}

interface PrincipalListProps {
  entries: AclEntry[];
  selectedPrincipalKey: string | null;
  canAdd: boolean;
  onSelect: (entry: AclEntry) => void;
  onAddUser: () => void;
  onAddGroup: () => void;
  onRemove: (keys?: string[]) => void;
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
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const entryKeys = useMemo(() => entries.map(principalKey), [entries]);
  const visibleChecked = checkedKeys.filter((key) => entryKeys.includes(key));
  const allChecked = entryKeys.length > 0 && visibleChecked.length === entryKeys.length;
  const canRemove = visibleChecked.length > 0 || Boolean(selectedPrincipalKey);

  const toggleChecked = (key: string) => {
    setCheckedKeys((prev) =>
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]
    );
  };

  const toggleAll = () => {
    setCheckedKeys(allChecked ? [] : entryKeys);
  };

  const handleRemove = () => {
    onRemove(visibleChecked);
    setCheckedKeys([]);
  };

  return (
    <div>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            aria-label="Select all principals"
            checked={allChecked}
            disabled={entries.length === 0}
            onChange={toggleAll}
          />
          Group or user names
        </label>
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
            onClick={handleRemove}
            disabled={!canRemove}
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
            const key = principalKey(entry);
            const selected = key === selectedPrincipalKey;
            const checked = visibleChecked.includes(key);
            return (
              <li key={key} className="flex items-stretch">
                <label className="flex items-center px-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${entry.principalName}`}
                    checked={checked}
                    onChange={() => toggleChecked(key)}
                  />
                </label>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(entry)}
                  className={`flex min-w-0 flex-1 items-center justify-between py-2 pr-3 text-left text-sm ${
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
