"use client";

import React, { FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { apiGet } from '@/lib/apiUtils';

type PermissionLevel = 'READ' | 'WRITE' | 'CREATE' | 'DELETE' | 'ADMIN';

interface CatalogObject {
  id: string;
  name: string;
  label: string;
}

interface CatalogClass {
  resourceType: string;
  label: string;
  objects: CatalogObject[];
}

export interface UpdatePolicyPayload {
  resourceType: string;
  scopes: PermissionLevel[];
  allObjects: boolean;
  objects: Array<{ id: string; label: string; name?: string }>;
}

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdatePolicy: (data: UpdatePolicyPayload) => void;
  initialResourceType?: string;
}

const PERMISSION_LEVELS: PermissionLevel[] = ['READ', 'WRITE', 'CREATE', 'DELETE', 'ADMIN'];

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  READ: 'Read',
  WRITE: 'Write',
  CREATE: 'Create',
  DELETE: 'Delete',
  ADMIN: 'Admin',
};

const initialPermissions: Record<PermissionLevel, boolean> = {
  READ: false,
  WRITE: false,
  CREATE: false,
  DELETE: false,
  ADMIN: false,
};

const PermissionModal: React.FC<PermissionModalProps> = ({
  isOpen,
  onClose,
  onUpdatePolicy,
  initialResourceType = 'SURVEY',
}) => {
  const [permissions, setPermissions] = useState(initialPermissions);
  const [classes, setClasses] = useState<CatalogClass[]>([]);
  const [resourceType, setResourceType] = useState(initialResourceType);
  const [allObjects, setAllObjects] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetInputId = useId();

  useEffect(() => {
    if (!isOpen) {
      setPermissions(initialPermissions);
      setResourceType(initialResourceType);
      setAllObjects(true);
      setSelectedIds([]);
      setError(null);
      return;
    }

    setResourceType(initialResourceType);
    setLoadingCatalog(true);
    apiGet<{ classes: CatalogClass[] }>('/permissions/catalog')
      .then((catalog) => {
        setClasses(catalog.classes || []);
        const preferred =
          catalog.classes?.find((c) => c.resourceType === initialResourceType) ||
          catalog.classes?.[0];
        if (preferred) {
          setResourceType(preferred.resourceType);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load objects.');
      })
      .finally(() => setLoadingCatalog(false));
  }, [isOpen, initialResourceType]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.resourceType === resourceType) || null,
    [classes, resourceType]
  );

  const handleTogglePermission = (level: PermissionLevel) => {
    setPermissions((prev) => ({ ...prev, [level]: !prev[level] }));
    if (error) setError(null);
  };

  const toggleObject = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    if (error) setError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const activeScopes = PERMISSION_LEVELS.filter((level) => permissions[level]);
    if (activeScopes.length === 0) {
      setError('Select at least one permission.');
      return;
    }

    if (!resourceType) {
      setError('Select a class.');
      return;
    }

    if (!allObjects && selectedIds.length === 0) {
      setError('Select all objects, or choose one or more existing objects.');
      return;
    }

    const objects = (selectedClass?.objects || [])
      .filter((obj) => selectedIds.includes(obj.id))
      .map((obj) => ({ id: obj.id, name: obj.name, label: obj.label }));

    onUpdatePolicy({
      resourceType,
      scopes: activeScopes,
      allObjects,
      objects,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit group policy">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={`${targetInputId}-type`} className="mb-2 block text-sm font-medium">
            Class
          </label>
          <select
            id={`${targetInputId}-type`}
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setSelectedIds([]);
              setAllObjects(true);
            }}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
            disabled={loadingCatalog}
          >
            {classes.map((entry) => (
              <option key={entry.resourceType} value={entry.resourceType}>
                {entry.label} ({entry.objects.length})
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Permissions apply to existing database objects. Survey responses are their own class, not
            a survey subclass. Choose a class, then all or specific objects.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Permissions</legend>
          {PERMISSION_LEVELS.map((level) => {
            const checkboxId = `${targetInputId}-${level.toLowerCase()}`;
            return (
              <label key={level} htmlFor={checkboxId} className="flex cursor-pointer items-center space-x-2">
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={permissions[level]}
                  onChange={() => handleTogglePermission(level)}
                  className="rounded border-gray-300"
                />
                <span>{PERMISSION_LABELS[level]}</span>
              </label>
            );
          })}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">Objects</legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allObjects}
              onChange={(e) => {
                setAllObjects(e.target.checked);
                if (e.target.checked) setSelectedIds([]);
              }}
            />
            All existing {selectedClass?.label?.toLowerCase() || 'objects'} (and future ones)
          </label>

          {!allObjects && (
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] p-3">
              {loadingCatalog ? (
                <p className="text-sm text-[var(--muted)]">Loading objects…</p>
              ) : !selectedClass?.objects.length ? (
                <p className="text-sm text-[var(--muted)]">
                  No objects of this class exist in the database yet. Use “All existing” to allow
                  create/list once objects appear, or create objects first.
                </p>
              ) : (
                selectedClass.objects.map((obj) => (
                  <label key={obj.id} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(obj.id)}
                      onChange={() => toggleObject(obj.id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{obj.name}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">{obj.id}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Save Policy
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PermissionModal;
