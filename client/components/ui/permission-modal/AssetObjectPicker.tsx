'use client';

import React, { useMemo, useState } from 'react';
import { matchesAssetFilter } from './assetFilter';
import type { CatalogObject } from './types';

interface AssetObjectPickerProps {
  selectionLocked: boolean;
  catalogLoading: boolean;
  aclLoading: boolean;
  selectableObjects: CatalogObject[];
  selectedIds: string[];
  initialResourceId: string | null;
  onToggleObject: (id: string) => void;
}

export function AssetObjectPicker({
  selectionLocked,
  catalogLoading,
  aclLoading,
  selectableObjects,
  selectedIds,
  initialResourceId,
  onToggleObject,
}: AssetObjectPickerProps) {
  const [assetFilter, setAssetFilter] = useState('');
  const visibleObjects = useMemo(
    () => selectableObjects.filter((object) => matchesAssetFilter(object, assetFilter)),
    [assetFilter, selectableObjects]
  );

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">
        {selectionLocked ? 'Asset' : 'Select assets'}
      </legend>
      {!selectionLocked && selectableObjects.length > 0 ? (
        <label className="mb-2 flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Filter assets</span>
          <input
            value={assetFilter}
            onChange={(event) => setAssetFilter(event.target.value)}
            placeholder="Filter by name…"
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
      ) : null}
      <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] p-3">
        {catalogLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : selectionLocked && selectableObjects.length === 0 ? (
          <p className="text-sm font-medium">{initialResourceId || 'Selected asset'}</p>
        ) : !selectableObjects.length ? (
          <p className="text-sm text-[var(--muted)]">No assets of this type exist yet.</p>
        ) : !visibleObjects.length ? (
          <p className="text-sm text-[var(--muted)]">No matching assets.</p>
        ) : (
          visibleObjects.map((object) => (
            <label
              key={object.id}
              className={`flex items-start gap-2 text-sm ${
                selectionLocked ? 'cursor-default' : 'cursor-pointer'
              }`}
            >
              {!selectionLocked ? (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(object.id)}
                  onChange={() => onToggleObject(object.id)}
                  className="mt-0.5"
                />
              ) : null}
              <span>
                <span className="font-medium">{object.label || object.name}</span>
                {object.detail && (
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">{object.detail}</span>
                )}
              </span>
            </label>
          ))
        )}
      </div>
      {aclLoading && (
        <p className="mt-2 text-xs text-[var(--muted)]">Loading permissions…</p>
      )}
    </fieldset>
  );
}
