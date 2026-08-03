"use client";

import React, { FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { apiGet, apiPost } from '@/lib/apiUtils';

type PermissionLevel = 'ADMIN' | 'WRITE' | 'READ' | 'CREATE' | 'DELETE';
type PrincipalType = 'USER' | 'GROUP';

interface CatalogObject {
  id: string;
  name: string;
  label: string;
  detail?: string;
}

interface CatalogClass {
  resourceType: string;
  label: string;
  objects: CatalogObject[];
}

interface CatalogPrincipal {
  id: string;
  name: string;
  label: string;
  principalType: PrincipalType;
}

interface AclEntry {
  principalType: PrincipalType;
  principalId: string;
  principalName: string;
  scopes: PermissionLevel[];
}

export interface UpdateAclPayload {
  resourceType: string;
  allObjects: boolean;
  objects: Array<{ id: string; label: string; name?: string }>;
  entries: Array<{
    principalType: PrincipalType;
    principalId: string;
    scopes: PermissionLevel[];
  }>;
}

interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void;
  initialResourceType?: string;
  /** Pre-select a specific asset when editing from a table row. */
  initialResourceId?: string | null;
  initialAllObjects?: boolean;
  initialPrincipalType?: PrincipalType | null;
  initialPrincipalId?: string | null;
}

/** Windows-style order: Full control → Modify → Read → Create → Delete */
const PERMISSION_LEVELS: PermissionLevel[] = ['ADMIN', 'WRITE', 'READ', 'CREATE', 'DELETE'];

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  ADMIN: 'Full control',
  WRITE: 'Modify',
  READ: 'Read',
  CREATE: 'Create',
  DELETE: 'Delete',
};

const emptyScopes = (): Record<PermissionLevel, boolean> => ({
  ADMIN: false,
  WRITE: false,
  READ: false,
  CREATE: false,
  DELETE: false,
});

function scopesToMap(scopes: string[]): Record<PermissionLevel, boolean> {
  const next = emptyScopes();
  for (const scope of scopes) {
    if (scope in next) next[scope as PermissionLevel] = true;
  }
  return next;
}

function mapToScopes(map: Record<PermissionLevel, boolean>): PermissionLevel[] {
  return PERMISSION_LEVELS.filter((level) => map[level]);
}

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
  const [classes, setClasses] = useState<CatalogClass[]>([]);
  const [users, setUsers] = useState<CatalogPrincipal[]>([]);
  const [groups, setGroups] = useState<CatalogPrincipal[]>([]);
  const [resourceType, setResourceType] = useState(initialResourceType);
  const [allObjects, setAllObjects] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [entries, setEntries] = useState<AclEntry[]>([]);
  const [selectedPrincipalKey, setSelectedPrincipalKey] = useState<string | null>(null);
  const [permissionMap, setPermissionMap] = useState(emptyScopes());
  const [addMode, setAddMode] = useState<'USER' | 'GROUP' | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [aclLoading, setAclLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGeneration = React.useRef(0);
  const preferredPrincipalKey = React.useRef<string | null>(null);

  const selectedClass = useMemo(
    () => classes.find((entry) => entry.resourceType === resourceType) || null,
    [classes, resourceType]
  );

  /** Editing an existing asset/class grant — do not offer other assets. */
  const selectionLocked = Boolean(initialResourceId) || Boolean(initialAllObjects);

  const selectableObjects = useMemo(() => {
    const objects = selectedClass?.objects || [];
    if (!selectionLocked || allObjects) return objects;
    const lockedIds = selectedIds.length
      ? selectedIds
      : initialResourceId
        ? [initialResourceId]
        : [];
    return objects.filter((object) => lockedIds.includes(object.id));
  }, [selectedClass, selectionLocked, allObjects, selectedIds, initialResourceId]);

  const selectedEntry = useMemo(() => {
    if (!selectedPrincipalKey) return null;
    return entries.find(
      (entry) => `${entry.principalType}:${entry.principalId}` === selectedPrincipalKey
    ) || null;
  }, [entries, selectedPrincipalKey]);

  const loadAcl = async (
    nextType: string,
    nextAllObjects: boolean,
    nextIds: string[],
    catalogUsers: CatalogPrincipal[],
    catalogGroups: CatalogPrincipal[]
  ) => {
    const generation = ++loadGeneration.current;

    if (!nextAllObjects && nextIds.length === 0) {
      if (generation !== loadGeneration.current) return;
      setEntries([]);
      setSelectedPrincipalKey(null);
      setPermissionMap(emptyScopes());
      return;
    }

    const params = new URLSearchParams({
      resourceType: nextType,
      allObjects: String(nextAllObjects),
    });
    if (!nextAllObjects) params.set('resourceIds', nextIds.join(','));

    const acl = await apiGet<{ entries: AclEntry[] }>(`/permissions/acl?${params.toString()}`);
    if (generation !== loadGeneration.current) return;

    const nextEntries = (acl.entries || []).map((entry) => ({
      ...entry,
      principalName:
        entry.principalName ||
        (entry.principalType === 'USER'
          ? catalogUsers.find((user) => user.id === entry.principalId)?.label
          : catalogGroups.find((group) => group.id === entry.principalId)?.label) ||
        entry.principalId,
      scopes: entry.scopes as PermissionLevel[],
    }));
    setEntries(nextEntries);
    const preferredKey = preferredPrincipalKey.current;
    const preferred = preferredKey
      ? nextEntries.find((entry) => `${entry.principalType}:${entry.principalId}` === preferredKey)
      : null;
    const first = preferred || nextEntries[0];
    if (first) {
      const key = `${first.principalType}:${first.principalId}`;
      setSelectedPrincipalKey(key);
      setPermissionMap(scopesToMap(first.scopes));
    } else {
      setSelectedPrincipalKey(null);
      setPermissionMap(emptyScopes());
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setAddMode(null);
      setSaving(false);
      preferredPrincipalKey.current = null;
      return;
    }

    setResourceType(initialResourceType);
    setAllObjects(Boolean(initialAllObjects));
    setSelectedIds(initialResourceId && !initialAllObjects ? [initialResourceId] : []);
    setEntries([]);
    setSelectedPrincipalKey(null);
    setPermissionMap(emptyScopes());
    preferredPrincipalKey.current =
      initialPrincipalType && initialPrincipalId
        ? `${initialPrincipalType}:${initialPrincipalId}`
        : null;
    setCatalogLoading(true);

    apiGet<{
      classes: CatalogClass[];
      principals: { users: CatalogPrincipal[]; groups: CatalogPrincipal[] };
    }>('/permissions/catalog')
      .then(async (catalog) => {
        const nextClasses = catalog.classes || [];
        setClasses(nextClasses);
        setUsers(catalog.principals?.users || []);
        setGroups(catalog.principals?.groups || []);
        const preferred =
          nextClasses.find((entry) => entry.resourceType === initialResourceType) ||
          nextClasses[0];
        if (preferred) setResourceType(preferred.resourceType);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load catalog.');
      })
      .finally(() => setCatalogLoading(false));
  }, [
    isOpen,
    initialResourceType,
    initialResourceId,
    initialAllObjects,
    initialPrincipalType,
    initialPrincipalId,
  ]);

  const persistSelectedPermissions = (
    key: string | null,
    map: Record<PermissionLevel, boolean>,
    list: AclEntry[]
  ) => {
    if (!key) return list;
    return list.map((entry) => {
      if (`${entry.principalType}:${entry.principalId}` !== key) return entry;
      return { ...entry, scopes: mapToScopes(map) };
    });
  };

  const selectPrincipal = (entry: AclEntry) => {
    const nextEntries = persistSelectedPermissions(selectedPrincipalKey, permissionMap, entries);
    setEntries(nextEntries);
    const key = `${entry.principalType}:${entry.principalId}`;
    setSelectedPrincipalKey(key);
    const fresh = nextEntries.find((row) => `${row.principalType}:${row.principalId}` === key);
    setPermissionMap(scopesToMap(fresh?.scopes || []));
    setError(null);
  };

  const toggleObject = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
    setError(null);
  };

  const refreshAclForSelection = async (
    nextAllObjects: boolean,
    nextIds: string[],
    nextType = resourceType,
    catalogUsers = users,
    catalogGroups = groups
  ) => {
    // Quiet refresh — do not flip catalogLoading or the asset list will flicker.
    setAclLoading(true);
    setError(null);
    try {
      await loadAcl(nextType, nextAllObjects, nextIds, catalogUsers, catalogGroups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions.');
    } finally {
      setAclLoading(false);
    }
  };

  // Auto-load ACL whenever the asset selection changes (without flickering the list).
  useEffect(() => {
    if (!isOpen || catalogLoading) return;

    if (!allObjects && selectedIds.length === 0) {
      setEntries([]);
      setSelectedPrincipalKey(null);
      setPermissionMap(emptyScopes());
      return;
    }

    const handle = window.setTimeout(() => {
      void refreshAclForSelection(allObjects, selectedIds, resourceType, users, groups);
    }, 150);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional selection-driven reload
  }, [isOpen, catalogLoading, allObjects, selectedIds, resourceType, users, groups]);

  const addPrincipal = (principal: CatalogPrincipal) => {
    const key = `${principal.principalType}:${principal.id}`;
    const existing = entries.find((entry) => `${entry.principalType}:${entry.principalId}` === key);
    let nextEntries = persistSelectedPermissions(selectedPrincipalKey, permissionMap, entries);
    if (!existing) {
      nextEntries = [
        ...nextEntries,
        {
          principalType: principal.principalType,
          principalId: principal.id,
          principalName: principal.label,
          scopes: ['READ'],
        },
      ];
    }
    setEntries(nextEntries);
    setSelectedPrincipalKey(key);
    setPermissionMap(scopesToMap(existing?.scopes || ['READ']));
    setAddMode(null);
    setError(null);
  };

  const removeSelectedPrincipal = () => {
    if (!selectedPrincipalKey) return;
    const next = entries.filter(
      (entry) => `${entry.principalType}:${entry.principalId}` !== selectedPrincipalKey
    );
    setEntries(next);
    const first = next[0];
    if (first) {
      setSelectedPrincipalKey(`${first.principalType}:${first.principalId}`);
      setPermissionMap(scopesToMap(first.scopes));
    } else {
      setSelectedPrincipalKey(null);
      setPermissionMap(emptyScopes());
    }
  };

  const handleTogglePermission = (level: PermissionLevel) => {
    if (!selectedPrincipalKey) return;
    setPermissionMap((prev) => {
      const next = { ...prev, [level]: !prev[level] };
      if (level === 'ADMIN' && next.ADMIN) {
        return {
          ADMIN: true,
          WRITE: true,
          READ: true,
          CREATE: true,
          DELETE: true,
        };
      }
      return next;
    });
    setError(null);
  };

  const handleApply = async (event: FormEvent) => {
    event.preventDefault();
    const nextEntries = persistSelectedPermissions(selectedPrincipalKey, permissionMap, entries);

    if (!allObjects && selectedIds.length === 0) {
      setError('Select one or more assets, or choose all objects of this type.');
      return;
    }

    const invalid = nextEntries.find((entry) => entry.scopes.length === 0);
    if (invalid) {
      setError(`Select at least one permission for ${invalid.principalName}.`);
      return;
    }

    // When applying ACL, store human-readable labels for survey responses.
    const objects = (selectedClass?.objects || [])
      .filter((object) => selectedIds.includes(object.id))
      .map((object) => ({
        id: object.id,
        name: object.name,
        label: object.label || object.name,
      }));

    setSaving(true);
    setError(null);
    try {
      // Canonical permission write API (not the deprecated POST /groups/:id/permissions).
      await apiPost('/permissions/acl', {
        resourceType,
        allObjects,
        objects,
        entries: nextEntries.map((entry) => ({
          principalType: entry.principalType,
          principalId: entry.principalId,
          scopes: entry.scopes,
        })),
      } satisfies UpdateAclPayload);
      onApplied?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply permissions.');
    } finally {
      setSaving(false);
    }
  };

  const addCandidates =
    addMode === 'USER'
      ? users.filter(
          (user) =>
            !entries.some(
              (entry) => entry.principalType === 'USER' && entry.principalId === user.id
            )
        )
      : addMode === 'GROUP'
        ? groups.filter(
            (group) =>
              !entries.some(
                (entry) => entry.principalType === 'GROUP' && entry.principalId === group.id
              )
          )
        : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Asset permissions" size="xl">
      <form onSubmit={handleApply} className="space-y-4">
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
              value={resourceType}
              disabled={catalogLoading || selectionLocked}
              onChange={(e) => {
                const nextType = e.target.value;
                setResourceType(nextType);
                setSelectedIds([]);
                setAllObjects(false);
                setEntries([]);
                setSelectedPrincipalKey(null);
                setPermissionMap(emptyScopes());
              }}
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
                checked={allObjects}
                disabled={selectionLocked}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAllObjects(checked);
                  if (checked) {
                    setSelectedIds([]);
                  } else {
                    setEntries([]);
                    setSelectedPrincipalKey(null);
                    setPermissionMap(emptyScopes());
                  }
                  setError(null);
                }}
              />
              All objects of this type (including future)
            </label>
          </div>
        </div>

        {!allObjects && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              {selectionLocked ? 'Asset' : 'Select asset(s)'}
            </legend>
            <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] p-3">
              {catalogLoading ? (
                <p className="text-sm text-[var(--muted)]">Loading…</p>
              ) : selectionLocked && selectableObjects.length === 0 ? (
                <p className="text-sm font-medium">
                  {initialResourceId || 'Selected asset'}
                </p>
              ) : !selectableObjects.length ? (
                <p className="text-sm text-[var(--muted)]">No assets of this type exist yet.</p>
              ) : (
                selectableObjects.map((object) => (
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
                        onChange={() => toggleObject(object.id)}
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
        )}

        {allObjects && aclLoading && (
          <p className="text-xs text-[var(--muted)]">Loading permissions…</p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p className="text-sm font-medium">Group or user names</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAddMode('USER')}
                  disabled={!allObjects && selectedIds.length === 0}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--accent-soft)] disabled:opacity-50"
                >
                  Create user…
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('GROUP')}
                  disabled={!allObjects && selectedIds.length === 0}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--accent-soft)] disabled:opacity-50"
                >
                  Create group…
                </button>
                <button
                  type="button"
                  onClick={removeSelectedPrincipal}
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
                        onClick={() => selectPrincipal(entry)}
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

          <div>
            <p className="mb-2 text-sm font-medium">
              Permissions for {selectedEntry?.principalName || 'selected name'}
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
                          onChange={() => handleTogglePermission(level)}
                          aria-label={PERMISSION_LABELS[level]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {addMode && (
          <div className="rounded-md border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">
                Add {addMode === 'USER' ? 'user' : 'group'}
              </p>
              <button
                type="button"
                onClick={() => setAddMode(null)}
                className="text-xs text-[var(--muted)] hover:underline"
              >
                Close
              </button>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {addCandidates.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No more {addMode === 'USER' ? 'users' : 'groups'} to add.</p>
              ) : (
                addCandidates.map((principal) => (
                  <button
                    key={principal.id}
                    type="button"
                    onClick={() => addPrincipal(principal)}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--accent-soft)]"
                  >
                    {principal.label}
                  </button>
                ))
              )}
            </div>
          </div>
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
            disabled={saving || catalogLoading}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {saving ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PermissionModal;
