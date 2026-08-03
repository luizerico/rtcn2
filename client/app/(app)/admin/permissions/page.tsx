"use client";

import { Fragment, useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/apiUtils';
import PermissionModal from '@/components/ui/PermissionModal';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

interface PermissionRecord {
  _id: string;
  principalType?: 'USER' | 'GROUP';
  principalId?: string;
  principalName?: string;
  groupId?: string | null;
  groupName?: string | null;
  resourceType: string;
  target: string;
  resourceId?: string | null;
  permission: string;
  answeredBy?: string | null;
  submittedAt?: string | null;
  owner?: string | null;
}

interface CatalogClass {
  resourceType: string;
  label: string;
  objects: Array<{
    id: string;
    name: string;
    label: string;
    answeredBy?: string | null;
    submittedAt?: string | null;
    owner?: string | null;
    detail?: string;
  }>;
}

const FALLBACK_TABS: CatalogClass[] = [
  { resourceType: 'DOCUMENT', label: 'Documents', objects: [] },
  { resourceType: 'DASHBOARD', label: 'Dashboards', objects: [] },
  { resourceType: 'DATASET', label: 'Datasets', objects: [] },
  { resourceType: 'SURVEY', label: 'Surveys', objects: [] },
  { resourceType: 'SURVEY_RESPONSE', label: 'Survey responses', objects: [] },
];

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

function principalLabel(row: PermissionRecord): string {
  return (
    row.principalName ||
    row.groupName ||
    (row.principalType === 'USER' ? 'User' : 'Group')
  );
}

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [tabs, setTabs] = useState<CatalogClass[]>(FALLBACK_TABS);
  const [activeType, setActiveType] = useState('SURVEY');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{
    resourceType: string;
    resourceId: string | null;
    allObjects: boolean;
    principalType: 'USER' | 'GROUP' | null;
    principalId: string | null;
  }>({
    resourceType: 'SURVEY',
    resourceId: null,
    allObjects: false,
    principalType: null,
    principalId: null,
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [permissionData, catalog] = await Promise.all([
        apiGet<PermissionRecord[]>('/permissions'),
        apiGet<{ classes: CatalogClass[] }>('/permissions/catalog'),
      ]);
      setPermissions(permissionData);
      if (catalog.classes?.length) {
        setTabs(catalog.classes);
        setActiveType((current) =>
          catalog.classes.some((entry) => entry.resourceType === current)
            ? current
            : catalog.classes[0].resourceType
        );
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

  /** Count distinct targets (objects / class-wide scopes), not individual action rows. */
  const grantCountByType = useMemo(() => {
    const targetsByType: Record<string, Set<string>> = {};
    for (const row of permissions) {
      if (!targetsByType[row.resourceType]) {
        targetsByType[row.resourceType] = new Set();
      }
      const targetKey = row.resourceId ? `${row.target}::${row.resourceId}` : row.target || '*';
      targetsByType[row.resourceType].add(targetKey);
    }
    const counts: Record<string, number> = {};
    for (const [resourceType, targets] of Object.entries(targetsByType)) {
      counts[resourceType] = targets.size;
    }
    return counts;
  }, [permissions]);

  const activeTargets = useMemo(() => {
    const resourceRows = permissions.filter((row) => row.resourceType === activeType);
    const byAsset = groupBy(resourceRows, (row) =>
      row.resourceId ? String(row.resourceId) : row.target || '*'
    );

    return Object.keys(byAsset)
      .sort((a, b) => {
        const aLabel = byAsset[a][0]?.target || a;
        const bLabel = byAsset[b][0]?.target || b;
        return aLabel.localeCompare(bLabel);
      })
      .map((key) => {
        const targetRows = byAsset[key];
        const byPrincipal = groupBy(
          targetRows,
          (row) =>
            `${row.principalType || 'GROUP'}:${row.principalId || row.groupId}:${principalLabel(row)}`
        );
        return {
          target: targetRows[0]?.target || key,
          resourceId: targetRows[0]?.resourceId || null,
          answeredBy: targetRows[0]?.answeredBy || null,
          submittedAt: targetRows[0]?.submittedAt || null,
          owner: targetRows[0]?.owner || null,
          principals: Object.keys(byPrincipal)
            .sort()
            .map((principalKey) => {
              const rows = byPrincipal[principalKey];
              return {
                principalType: (rows[0].principalType || 'GROUP') as 'USER' | 'GROUP',
                principalId: rows[0].principalId || rows[0].groupId || '',
                principalName: principalLabel(rows[0]),
                actions: uniqueSorted(rows.map((row) => row.permission)),
              };
            }),
        };
      });
  }, [permissions, activeType]);

  const isSurveyResponseTab = activeType === 'SURVEY_RESPONSE';
  const isSurveyTab = activeType === 'SURVEY';

  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogClass['objects'][number]>();
    for (const object of activeTabObjects(tabs, activeType)) {
      map.set(object.id, object);
    }
    return map;
  }, [tabs, activeType]);

  const assetGroups = useMemo(() => {
    return activeTargets.map((target) => {
      const allObjects = !target.resourceId && (target.target === '*' || !target.target);
      const catalogObject = target.resourceId ? catalogById.get(String(target.resourceId)) : undefined;
      const objectLabel = allObjects
        ? 'All objects of this type'
        : catalogObject?.label || catalogObject?.name || target.target;

      return {
        key: `${target.resourceId || 'all'}::${target.target}`,
        objectLabel,
        resourceId: target.resourceId,
        allObjects,
        answeredBy: catalogObject?.answeredBy || target.answeredBy || null,
        submittedAt: catalogObject?.submittedAt || target.submittedAt || null,
        owner: catalogObject?.owner || target.owner || null,
        detail: catalogObject?.detail || null,
        principals: target.principals,
      };
    });
  }, [activeTargets, catalogById]);

  const openEditForType = () => {
    setEditTarget({
      resourceType: activeType,
      resourceId: null,
      allObjects: false,
      principalType: null,
      principalId: null,
    });
    setPolicyModalOpen(true);
  };

  const openEditForAsset = (group: (typeof assetGroups)[number]) => {
    setEditTarget({
      resourceType: activeType,
      resourceId: group.resourceId,
      allObjects: group.allObjects,
      principalType: null,
      principalId: null,
    });
    setPolicyModalOpen(true);
  };

  const formatSubmittedAt = (value: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  };

  const activeTab = tabs.find((tab) => tab.resourceType === activeType) || tabs[0];

  const actionLabels: Record<string, string> = {
    ADMIN: 'Full control',
    WRITE: 'Modify',
    READ: 'Read',
    CREATE: 'Create',
    DELETE: 'Delete',
  };

  const formatActions = (actions: string[]) =>
    actions.map((action) => actionLabels[action] || action).join(', ');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 sm:space-y-8">
      <header className="border-b border-[var(--border)] pb-4 sm:pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Permissions' },
          ]}
        />
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
          Admin / Permissions
        </p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Permission management</h1>
        <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
          Windows-style access control for assets only. Choose an asset type tab, then edit
          permissions for objects of that type.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible"
          role="tablist"
          aria-label="Asset types"
        >
          <div className="flex min-w-max gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 lg:min-w-0 lg:flex-wrap">
            {tabs.map((tab) => {
              const selected = tab.resourceType === activeType;
              const count = grantCountByType[tab.resourceType] || 0;
              return (
                <button
                  key={tab.resourceType}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  id={`perm-tab-${tab.resourceType}`}
                  onClick={() => {
                    setActiveType(tab.resourceType);
                    setExpandedKey(null);
                  }}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    selected
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 text-xs ${selected ? 'text-white/80' : 'text-[var(--muted)]'}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={openEditForType}
          className="w-full shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] sm:w-auto"
        >
          Add permission
        </button>
      </div>

      <section
        className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        role="tabpanel"
        aria-labelledby={`perm-tab-${activeType}`}
      >
        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading permissions…</p>
        ) : assetGroups.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">
            No permissions for {activeTab?.label?.toLowerCase() || 'this type'} yet. Use Add
            permission to select assets and assign users or groups.
          </p>
        ) : (
          <>
            {/* Mobile / tablet cards */}
            <ul className="divide-y divide-[var(--border)] lg:hidden">
              {assetGroups.map((group) => {
                const expanded = expandedKey === group.key;
                return (
                  <li key={group.key} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedKey((prev) => (prev === group.key ? null : group.key))
                        }
                        className="min-w-0 flex-1 text-left"
                        aria-expanded={expanded}
                      >
                        <p className="font-medium break-words">{group.objectLabel}</p>
                        {group.detail ? (
                          <p className="mt-0.5 text-xs text-[var(--muted)]">{group.detail}</p>
                        ) : null}
                        {isSurveyTab ? (
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            Owner: {group.owner || '—'}
                          </p>
                        ) : null}
                        {isSurveyResponseTab ? (
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {group.answeredBy || '—'}
                            {group.submittedAt ? ` · ${formatSubmittedAt(group.submittedAt)}` : ''}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {group.principals.length} principal
                          {group.principals.length === 1 ? '' : 's'}
                          {group.principals.length
                            ? `: ${group.principals.map((p) => p.principalName).join(', ')}`
                            : ''}
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForAsset(group)}
                          className="text-sm text-[var(--accent)] hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedKey((prev) => (prev === group.key ? null : group.key))
                          }
                          className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]"
                          aria-expanded={expanded}
                        >
                          {expanded ? 'Hide' : 'Details'}
                        </button>
                      </div>
                    </div>
                    {expanded ? (
                      <div className="mt-3 space-y-2 rounded-md border border-[var(--border)] bg-slate-50/80 p-3">
                        {group.principals.map((principal) => (
                          <div
                            key={`${principal.principalType}-${principal.principalId || principal.principalName}`}
                            className="text-sm"
                          >
                            <p className="font-medium">
                              {principal.principalName}{' '}
                              <span className="font-normal text-[var(--muted)]">
                                ({principal.principalType === 'USER' ? 'User' : 'Group'})
                              </span>
                            </p>
                            <p className="text-[var(--muted)]">{formatActions(principal.actions)}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                  <tr>
                    <th className="w-10 px-4 py-3 font-medium" aria-label="Expand" />
                    <th className="px-4 py-3 font-medium">
                      {isSurveyResponseTab ? 'Survey' : 'Asset'}
                    </th>
                    {isSurveyResponseTab && (
                      <>
                        <th className="px-4 py-3 font-medium">Answered by</th>
                        <th className="px-4 py-3 font-medium">Submitted</th>
                      </>
                    )}
                    {isSurveyTab && <th className="px-4 py-3 font-medium">Owner</th>}
                    <th className="px-4 py-3 font-medium">Principals</th>
                    <th className="hidden px-4 py-3 font-medium xl:table-cell">Granted to</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assetGroups.map((group) => {
                    const expanded = expandedKey === group.key;
                    const colSpan =
                      5 + (isSurveyResponseTab ? 2 : 0) + (isSurveyTab ? 1 : 0);
                    const summaryPrincipals = group.principals
                      .map((principal) => principal.principalName)
                      .filter(Boolean);

                    return (
                      <Fragment key={group.key}>
                        <tr className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent-soft)]/20">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedKey((prev) => (prev === group.key ? null : group.key))
                              }
                              className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)]/40"
                              aria-expanded={expanded}
                              aria-label={
                                expanded ? 'Hide permission details' : 'Show permission details'
                              }
                            >
                              {expanded ? '▾' : '▸'}
                            </button>
                          </td>
                          <td className="max-w-xs px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedKey((prev) => (prev === group.key ? null : group.key))
                              }
                              className="text-left font-medium hover:underline"
                            >
                              {group.objectLabel}
                            </button>
                            {group.detail ? (
                              <div className="mt-0.5 text-xs text-[var(--muted)]">{group.detail}</div>
                            ) : null}
                          </td>
                          {isSurveyResponseTab && (
                            <>
                              <td className="px-4 py-3">{group.answeredBy || '—'}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">
                                {formatSubmittedAt(group.submittedAt)}
                              </td>
                            </>
                          )}
                          {isSurveyTab && (
                            <td className="px-4 py-3">{group.owner || '—'}</td>
                          )}
                          <td className="px-4 py-3">{group.principals.length}</td>
                          <td className="hidden max-w-sm px-4 py-3 text-[var(--muted)] xl:table-cell">
                            {summaryPrincipals.length ? summaryPrincipals.join(', ') : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openEditForAsset(group)}
                              className="text-[var(--accent)] hover:underline"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-b border-[var(--border)] bg-slate-50/80">
                            <td colSpan={colSpan} className="px-4 py-3">
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                                Permission details
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                  <thead className="text-[var(--muted)]">
                                    <tr>
                                      <th className="py-1 pr-3 font-medium">Name</th>
                                      <th className="py-1 pr-3 font-medium">Type</th>
                                      <th className="py-1 font-medium">Permissions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.principals.map((principal) => (
                                      <tr
                                        key={`${principal.principalType}-${principal.principalId || principal.principalName}`}
                                        className="border-t border-[var(--border)]"
                                      >
                                        <td className="py-2 pr-3">{principal.principalName}</td>
                                        <td className="py-2 pr-3 text-[var(--muted)]">
                                          {principal.principalType === 'USER' ? 'User' : 'Group'}
                                        </td>
                                        <td className="py-2">
                                          {formatActions(principal.actions)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <PermissionModal
        isOpen={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        onApplied={loadData}
        initialResourceType={editTarget.resourceType}
        initialResourceId={editTarget.resourceId}
        initialAllObjects={editTarget.allObjects}
        initialPrincipalType={editTarget.principalType}
        initialPrincipalId={editTarget.principalId}
      />
    </div>
  );
}

function activeTabObjects(tabs: CatalogClass[], activeType: string) {
  return tabs.find((tab) => tab.resourceType === activeType)?.objects || [];
}
