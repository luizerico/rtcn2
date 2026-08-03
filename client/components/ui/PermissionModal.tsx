"use client";

import React, { useId } from 'react';
import { Modal } from '@/components/ui/Modal';
import { AddPrincipalPanel } from './permission-modal/AddPrincipalPanel';
import { AssetObjectPicker } from './permission-modal/AssetObjectPicker';
import { PermissionScopeTable } from './permission-modal/PermissionScopeTable';
import { PrincipalList } from './permission-modal/PrincipalList';
import type { PermissionModalProps } from './permission-modal/types';
import { useAssetAclEditor } from './permission-modal/useAssetAclEditor';
import { usePermissionCatalog } from './permission-modal/usePermissionCatalog';

export type { UpdateAclPayload, PermissionModalProps } from './permission-modal/types';

const PermissionModal: React.FC<PermissionModalProps> = ({
  isOpen,
  onClose,
  onApplied,
  initialResourceType = 'SURVEY',
  initialResourceId = null,
  initialAllObjects = false,
  initialPrincipalType = null,
  initialPrincipalId = null,
}) => {
  const formId = useId();
  const {
    classes,
    users,
    groups,
    catalogLoading,
    error,
    setError,
  } = usePermissionCatalog(isOpen);

  const editor = useAssetAclEditor({
    isOpen,
    catalogLoading,
    classes,
    users,
    groups,
    initialResourceType,
    initialResourceId,
    initialAllObjects,
    initialPrincipalType,
    initialPrincipalId,
    onApplied,
    onClose,
    setSharedError: setError,
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Asset permissions" size="xl">
      <form onSubmit={editor.handleApply} className="space-y-4">
        <p className="text-xs text-[var(--muted)]">
          Permissions apply only to asset subclasses (documents, dashboards, datasets, surveys,
          survey responses). Users and groups are not assets — they appear only as who receives
          access.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-type`} className="mb-1 block text-sm font-medium">
              Object type
            </label>
            <select
              id={`${formId}-type`}
              value={editor.resourceType}
              disabled={catalogLoading || editor.selectionLocked}
              onChange={(e) => editor.changeResourceType(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:bg-slate-50 disabled:opacity-70"
            >
              {classes.map((entry) => (
                <option key={entry.resourceType} value={entry.resourceType}>
                  {entry.label} ({entry.objects.length})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={editor.allObjects}
                disabled={editor.selectionLocked}
                onChange={(e) => editor.changeAllObjects(e.target.checked)}
              />
              All objects of this type (including future)
            </label>
          </div>
        </div>

        {!editor.allObjects && (
          <AssetObjectPicker
            selectionLocked={editor.selectionLocked}
            catalogLoading={catalogLoading}
            aclLoading={editor.aclLoading}
            selectableObjects={editor.selectableObjects}
            selectedIds={editor.selectedIds}
            initialResourceId={initialResourceId}
            onToggleObject={editor.toggleObject}
          />
        )}

        {editor.allObjects && editor.aclLoading && (
          <p className="text-xs text-[var(--muted)]">Loading permissions…</p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <PrincipalList
            entries={editor.entries}
            selectedPrincipalKey={editor.selectedPrincipalKey}
            canAdd={editor.allObjects || editor.selectedIds.length > 0}
            onSelect={editor.selectPrincipal}
            onAddUser={() => editor.setAddMode('USER')}
            onAddGroup={() => editor.setAddMode('GROUP')}
            onRemove={editor.removeSelectedPrincipal}
          />

          <PermissionScopeTable
            formId={formId}
            principalName={editor.selectedEntry?.principalName}
            selectedPrincipalKey={editor.selectedPrincipalKey}
            permissionMap={editor.permissionMap}
            onToggle={editor.handleTogglePermission}
          />
        </div>

        {editor.addMode && (
          <AddPrincipalPanel
            addMode={editor.addMode}
            candidates={editor.addCandidates}
            onClose={() => editor.setAddMode(null)}
            onAdd={editor.addPrincipal}
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={editor.saving || catalogLoading}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {editor.saving ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PermissionModal;
