'use client';

import React from 'react';
import { PERMISSION_LABELS, PERMISSION_LEVELS } from './permissionScopes';
import type { PermissionLevel } from './types';

interface PermissionScopeTableProps {
  formId: string;
  principalName: string | undefined;
  selectedPrincipalKey: string | null;
  permissionMap: Record<PermissionLevel, boolean>;
  onToggle: (level: PermissionLevel) => void;
}

export function PermissionScopeTable({
  formId,
  principalName,
  selectedPrincipalKey,
  permissionMap,
  onToggle,
}: PermissionScopeTableProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        Permissions for {principalName || 'selected name'}
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
            <th className="py-2 font-medium">Permission</th>
            <th className="w-20 py-2 text-center font-medium">Allow</th>
          </tr>
        </thead>
        <tbody>
          {PERMISSION_LEVELS.map((level) => {
            const checkboxId = `${formId}-${level.toLowerCase()}`;
            return (
              <tr key={level} className="border-b border-[var(--border)] last:border-0">
                <td className="py-2">
                  <label htmlFor={checkboxId} className="cursor-pointer">
                    {PERMISSION_LABELS[level]}
                  </label>
                </td>
                <td className="py-2 text-center">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    disabled={!selectedPrincipalKey}
                    checked={permissionMap[level]}
                    onChange={() => onToggle(level)}
                    aria-label={PERMISSION_LABELS[level]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
