"use client";

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '@/lib/apiUtils';
import PermissionModal, { UpdatePolicyPayload } from '@/components/ui/PermissionModal';

interface GroupRecord {
  _id: string;
  name: string;
}

interface PermissionRecord {
  _id: string;
  groupId: string;
  groupName: string;
  resourceType: string;
  target: string;
  permission: string;
}

type ViewMode = 'group' | 'asset';

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export default function AdminPermissionsPage() {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('group');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [policyModalOpen, setPolicyModalOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupData, permissionData] = await Promise.all([
        apiGet<GroupRecord[]>('/groups'),
        apiGet<PermissionRecord[]>('/permissions'),
      ]);
      setGroups(groupData);
      setPermissions(permissionData);
      if (!selectedGroupId && groupData[0]?._id) {
        setSelectedGroupId(groupData[0]._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const permissionsByGroup = useMemo(() => {
    const byGroup = groupBy(permissions, (row) => String(row.groupId));
    return groups.map((group) => {
      const rows = byGroup[group._id] || [];
      const byResource = groupBy(rows, (row) => row.resourceType);
      return {
        group,
        resourceTypes: Object.keys(byResource)
          .sort()
          .map((resourceType) => {
            const resourceRows = byResource[resourceType];
            const byTarget = groupBy(resourceRows, (row) => row.target);
            return {
              resourceType,
              targets: Object.keys(byTarget)
                .sort()
                .map((target) => ({
                  target,
                  actions: uniqueSorted(byTarget[target].map((row) => row.permission)),
                })),
            };
          }),
        total: rows.length,
      };
    });
  }, [groups, permissions]);

  const permissionsByObject = useMemo(() => {
    const byResource = groupBy(permissions, (row) => row.resourceType);
    return Object.keys(byResource)
      .sort()
      .map((resourceType) => {
        const resourceRows = byResource[resourceType];
        const byTarget = groupBy(resourceRows, (row) => row.target);
        return {
          resourceType,
          targets: Object.keys(byTarget)
            .sort()
            .map((target) => {
              const targetRows = byTarget[target];
              const byGroupName = groupBy(targetRows, (row) => row.groupName || String(row.groupId));
              return {
                target,
                groups: Object.keys(byGroupName)
                  .sort()
                  .map((groupName) => ({
                    groupName,
                    groupId: byGroupName[groupName][0]?.groupId,
                    actions: uniqueSorted(byGroupName[groupName].map((row) => row.permission)),
                  })),
              };
            }),
        };
      });
  }, [permissions]);

  const handleUpdatePolicy = async (payload: UpdatePolicyPayload) => {
    if (!selectedGroupId) return;
    setError(null);
    try {
      await apiPost(`/groups/${selectedGroupId}/permissions`, {
        scopes: payload.scopes,
        resourceType: payload.resourceType,
        allObjects: payload.allObjects,
        objects: payload.objects,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permissions.');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
          Admin / Permissions
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Permission management</h1>
        <p className="mt-2 text-[var(--muted)]">
          Grant group access to concrete database objects: pick a class, then one, many, or all
          existing objects. Survey responses are a separate class from surveys.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-[var(--border)] p-1">
          <button
            type="button"
            onClick={() => setViewMode('group')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              viewMode === 'group' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
            }`}
          >
            By group
          </button>
          <button
            type="button"
            onClick={() => setViewMode('asset')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              viewMode === 'asset' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
            }`}
          >
            By asset
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">Select group to edit</option>
            {groups.map((group) => (
              <option key={group._id} value={group._id}>
                {group.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (!selectedGroupId) {
                setError('Select a group first.');
                return;
              }
              setPolicyModalOpen(true);
            }}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            Edit policy
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-[var(--muted)]">Loading permissions…</p>
      ) : viewMode === 'group' ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Permissions by group</h2>
          {permissionsByGroup.length === 0 ? (
            <p className="text-[var(--muted)]">No groups found.</p>
          ) : (
            permissionsByGroup.map(({ group, resourceTypes, total }) => (
              <article
                key={group._id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">{group.name}</h3>
                    <p className="text-sm text-[var(--muted)]">{total} permission row(s)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group._id);
                      setPolicyModalOpen(true);
                    }}
                    className="text-sm font-medium text-[var(--accent)] hover:underline"
                  >
                    Edit
                  </button>
                </div>

                {resourceTypes.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No permissions assigned.</p>
                ) : (
                  <div className="space-y-4">
                    {resourceTypes.map(({ resourceType, targets }) => (
                      <div key={`${group._id}-${resourceType}`}>
                        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                          {resourceType}
                        </h4>
                        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                          <table className="min-w-full text-left text-sm">
                            <thead className="bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                              <tr>
                                <th className="px-3 py-2 font-medium">Target / asset</th>
                                <th className="px-3 py-2 font-medium">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {targets.map(({ target, actions }) => (
                                <tr key={`${group._id}-${resourceType}-${target}`} className="border-t border-[var(--border)]">
                                  <td className="px-3 py-2 font-medium">{target}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {actions.map((action) => (
                                        <span
                                          key={action}
                                          className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent-strong)]"
                                        >
                                          {action}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Permissions by asset / resource</h2>
          {permissionsByObject.length === 0 ? (
            <p className="text-[var(--muted)]">No permissions found.</p>
          ) : (
            permissionsByObject.map(({ resourceType, targets }) => (
              <article
                key={resourceType}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <h3 className="mb-4 text-xl font-semibold">{resourceType}</h3>
                <div className="space-y-4">
                  {targets.map(({ target, groups: targetGroups }) => (
                    <div key={`${resourceType}-${target}`}>
                      <h4 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
                        Target: <span className="font-mono">{target}</span>
                      </h4>
                      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                            <tr>
                              <th className="px-3 py-2 font-medium">Group</th>
                              <th className="px-3 py-2 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {targetGroups.map(({ groupName, groupId, actions }) => (
                              <tr key={`${resourceType}-${target}-${groupId}`} className="border-t border-[var(--border)]">
                                <td className="px-3 py-2 font-medium">{groupName}</td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {actions.map((action) => (
                                      <span
                                        key={action}
                                        className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent-strong)]"
                                      >
                                        {action}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </section>
      )}

      <PermissionModal
        isOpen={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        onUpdatePolicy={handleUpdatePolicy}
        initialResourceType="SURVEY"
      />
    </div>
  );
}
