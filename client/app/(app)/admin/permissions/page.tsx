"use client";

import { useEffect, useMemo, useState } from 'react';
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
    const byTarget = groupBy(resourceRows, (row) =>
      row.resourceId ? `${row.target}::${row.resourceId}` : row.target
    );

    return Object.keys(byTarget)
      .sort((a, b) => {
        const aLabel = byTarget[a][0]?.target || a;
        const bLabel = byTarget[b][0]?.target || b;
        return aLabel.localeCompare(bLabel);
      })
      .map((key) => {
        const targetRows = byTarget[key];
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

  const tableRows = useMemo(() => {
    const rows: Array<{
      key: string;
      objectLabel: string;
      resourceId: string | null;
      allObjects: boolean;
      answeredBy: string | null;
      submittedAt: string | null;
      owner: string | null;
      principalType: 'USER' | 'GROUP';
      principalId: string;
      principalName: string;
      actions: string[];
    }> = [];

    for (const target of activeTargets) {
      const allObjects = !target.resourceId && (target.target === '*' || !target.target);
      const objectLabel = allObjects ? 'All objects of this type' : target.target;
      for (const principal of target.principals) {
        rows.push({
          key: `${target.resourceId || target.target}-${principal.principalType}-${principal.principalId || principal.principalName}`,
          objectLabel,
          resourceId: target.resourceId,
          allObjects,
          answeredBy: target.answeredBy,
          submittedAt: target.submittedAt,
          owner: target.owner,
          principalType: principal.principalType,
          principalId: principal.principalId,
          principalName: principal.principalName,
          actions: principal.actions,
        });
      }
    }

    return rows.sort((a, b) => {
      const byObject = a.objectLabel.localeCompare(b.objectLabel);
      if (byObject !== 0) return byObject;
      const byAnswered = (a.answeredBy || '').localeCompare(b.answeredBy || '');
      if (byAnswered !== 0) return byAnswered;
      const byOwner = (a.owner || '').localeCompare(b.owner || '');
      if (byOwner !== 0) return byOwner;
      return a.principalName.localeCompare(b.principalName);
    });
  }, [activeTargets]);

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

  const openEditForRow = (row: (typeof tableRows)[number]) => {
    setEditTarget({
      resourceType: activeType,
      resourceId: row.resourceId,
      allObjects: row.allObjects,
      principalType: row.principalType,
      principalId: row.principalId || null,
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
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
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
        <h1 className="mt-2 text-3xl font-semibold">Permission management</h1>
        <p className="mt-2 text-[var(--muted)]">
          Windows-style access control for assets only. Choose an asset type tab, then edit
          permissions for objects of that type.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
          role="tablist"
          aria-label="Asset types"
        >
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
                onClick={() => setActiveType(tab.resourceType)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
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

        <button
          type="button"
          onClick={openEditForType}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
        >
          Edit {activeTab?.label?.toLowerCase() || 'asset'} permissions…
        </button>
      </div>

      <section
        className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        role="tabpanel"
        aria-labelledby={`perm-tab-${activeType}`}
      >
        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading permissions…</p>
        ) : tableRows.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">
            No permissions for {activeTab?.label?.toLowerCase() || 'this type'} yet. Use Edit to
            select assets and assign users or groups.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    {isSurveyResponseTab ? 'Survey' : 'Object'}
                  </th>
                  {isSurveyResponseTab && (
                    <>
                      <th className="px-4 py-3 font-medium">Answered by</th>
                      <th className="px-4 py-3 font-medium">Submitted</th>
                    </>
                  )}
                  {isSurveyTab && <th className="px-4 py-3 font-medium">Owner</th>}
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Permissions</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.key} className="border-b border-[var(--border)] last:border-0">
                    <td className="max-w-xs px-4 py-3 font-medium">{row.objectLabel}</td>
                    {isSurveyResponseTab && (
                      <>
                        <td className="px-4 py-3">{row.answeredBy || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">
                          {formatSubmittedAt(row.submittedAt)}
                        </td>
                      </>
                    )}
                    {isSurveyTab && <td className="px-4 py-3">{row.owner || '—'}</td>}
                    <td className="px-4 py-3">{row.principalName}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {row.principalType === 'USER' ? 'User' : 'Group'}
                    </td>
                    <td className="px-4 py-3">{formatActions(row.actions)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditForRow(row)}
                        className="text-[var(--accent)] hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
