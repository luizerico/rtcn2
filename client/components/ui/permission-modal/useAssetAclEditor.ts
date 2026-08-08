'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/lib/apiUtils';
import { emptyScopes, mapToScopes, scopesToMap } from './permissionScopes';
import type {
  AclEntry,
  CatalogClass,
  CatalogPrincipal,
  PermissionLevel,
  PrincipalType,
  UpdateAclPayload,
} from './types';

interface UseAssetAclEditorOptions {
  isOpen: boolean;
  catalogLoading: boolean;
  classes: CatalogClass[];
  users: CatalogPrincipal[];
  groups: CatalogPrincipal[];
  initialResourceType: string;
  initialResourceId: string | null;
  initialAllObjects: boolean;
  initialPrincipalType: PrincipalType | null;
  initialPrincipalId: string | null;
  onApplied?: () => void;
  onClose: () => void;
  setSharedError: (message: string | null) => void;
}

export function useAssetAclEditor({
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
  setSharedError,
}: UseAssetAclEditorOptions) {
  const [resourceType, setResourceType] = useState(initialResourceType);
  const [allObjects, setAllObjects] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [entries, setEntries] = useState<AclEntry[]>([]);
  const [selectedPrincipalKey, setSelectedPrincipalKey] = useState<string | null>(null);
  const [permissionMap, setPermissionMap] = useState(emptyScopes());
  const [addMode, setAddMode] = useState<'USER' | 'GROUP' | null>(null);
  const [aclLoading, setAclLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadGeneration = useRef(0);
  const preferredPrincipalKey = useRef<string | null>(null);
  const catalogPreferApplied = useRef(false);

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
    return (
      entries.find(
        (entry) => `${entry.principalType}:${entry.principalId}` === selectedPrincipalKey
      ) || null
    );
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
      ? nextEntries.find(
          (entry) => `${entry.principalType}:${entry.principalId}` === preferredKey
        )
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
      setAddMode(null);
      setSaving(false);
      preferredPrincipalKey.current = null;
      catalogPreferApplied.current = false;
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
    catalogPreferApplied.current = false;
  }, [
    isOpen,
    initialResourceType,
    initialResourceId,
    initialAllObjects,
    initialPrincipalType,
    initialPrincipalId,
  ]);

  // Prefer catalog's matching (or first) resource type once classes arrive.
  useEffect(() => {
    if (!isOpen || catalogLoading || catalogPreferApplied.current || classes.length === 0) {
      return;
    }
    const preferred =
      classes.find((entry) => entry.resourceType === initialResourceType) || classes[0];
    if (preferred) setResourceType(preferred.resourceType);
    catalogPreferApplied.current = true;
  }, [isOpen, catalogLoading, classes, initialResourceType]);

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
    setSharedError(null);
  };

  const toggleObject = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
    setSharedError(null);
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
    setSharedError(null);
    try {
      await loadAcl(nextType, nextAllObjects, nextIds, catalogUsers, catalogGroups);
    } catch (err) {
      setSharedError(err instanceof Error ? err.message : 'Failed to load permissions.');
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
    const existing = entries.find(
      (entry) => `${entry.principalType}:${entry.principalId}` === key
    );
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
    setSharedError(null);
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
    setSharedError(null);
  };

  const changeResourceType = (nextType: string) => {
    setResourceType(nextType);
    setSelectedIds([]);
    setAllObjects(false);
    setEntries([]);
    setSelectedPrincipalKey(null);
    setPermissionMap(emptyScopes());
  };

  const changeAllObjects = (checked: boolean) => {
    setAllObjects(checked);
    if (checked) {
      setSelectedIds([]);
    } else {
      setEntries([]);
      setSelectedPrincipalKey(null);
      setPermissionMap(emptyScopes());
    }
    setSharedError(null);
  };

  const handleApply = async (event: FormEvent) => {
    event.preventDefault();
    const nextEntries = persistSelectedPermissions(selectedPrincipalKey, permissionMap, entries);

    if (!allObjects && selectedIds.length === 0) {
      setSharedError('Select one or more assets, or choose all objects of this type.');
      return;
    }

    const invalid = nextEntries.find((entry) => entry.scopes.length === 0);
    if (invalid) {
      setSharedError(`Select at least one permission for ${invalid.principalName}.`);
      return;
    }

    const objects = (selectedClass?.objects || [])
      .filter((object) => selectedIds.includes(object.id))
      .map((object) => ({
        id: object.id,
        name: object.name,
        label: object.label || object.name,
      }));

    setSaving(true);
    setSharedError(null);
    try {
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
      setSharedError(err instanceof Error ? err.message : 'Failed to apply permissions.');
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

  return {
    resourceType,
    allObjects,
    selectedIds,
    entries,
    selectedPrincipalKey,
    permissionMap,
    addMode,
    aclLoading,
    saving,
    selectedClass,
    selectionLocked,
    selectableObjects,
    selectedEntry,
    addCandidates,
    setAddMode,
    selectPrincipal,
    toggleObject,
    addPrincipal,
    removeSelectedPrincipal,
    handleTogglePermission,
    changeResourceType,
    changeAllObjects,
    handleApply,
  };
}
