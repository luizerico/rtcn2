"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/apiUtils';
import PermissionModal from '@/components/ui/PermissionModal';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import { useAccess } from '@/components/AccessProvider';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import { AccessIconButton, TableActionRow, tableActionRowGroupClass } from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';

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
  { resourceType: 'SPONSOR', label: 'Sponsors', objects: [] },
  { resourceType: 'OPPORTUNITY', label: 'Opportunities', objects: [] },
  { resourceType: 'PROJECT', label: 'Projects', objects: [] },
];

const PERMISSION_COLUMNS: ColumnDef[] = [
  { id: 'asset', label: 'Asset', alwaysVisible: true },
  { id: 'owner', label: 'Owner / Answered by' },
  { id: 'principals', label: 'Principals' },
  { id: 'grantedTo', label: 'Granted to' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

const DEFAULT_FILTERS = {
  q: '',
  principalType: '',
  principalName: '',
};

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
  const { can, refresh, isAdmin } = useAccess();
  const canWrite = can('GROUP:WRITE');
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

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const columns = useMemo(() => PERMISSION_COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('admin-permissions', columns, {
    enabled: isAdmin,
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

  const filteredGroups = useMemo(() => {
    const q = applied.q.trim().toLowerCase();
    return assetGroups.filter((group) => {
      if (applied.principalType) {
        if (!group.principals.some((p) => p.principalType === applied.principalType)) return false;
      }
      if (applied.principalName.trim()) {
        const needle = applied.principalName.trim().toLowerCase();
        if (!group.principals.some((p) => p.principalName.toLowerCase().includes(needle))) {
          return false;
        }
      }
      if (!q) return true;
      const haystack = [
        group.objectLabel,
        group.detail,
        group.owner,
        group.answeredBy,
        ...group.principals.map((p) => p.principalName),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assetGroups, applied]);

  const total = filteredGroups.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const safePage = totalPages > 0 && page > totalPages ? totalPages : page;
  const pagedGroups = useMemo(() => {
    const start = (safePage - 1) * limit;
    return filteredGroups.slice(start, start + limit);
  }, [filteredGroups, safePage, limit]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const hasActiveFilters = Object.values(applied).some(Boolean);

  const onSubmitFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const onResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setPage(1);
  };

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
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Permissions' },
          ]}
        />
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
                    setPage(1);
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

        <AccessPrimaryButton
          allowed={canWrite}
          onClick={openEditForType}
          className="w-full shrink-0 sm:w-auto"
        >
          Create permission
        </AccessPrimaryButton>
      </div>

      {showFilters ? (
        <form
          onSubmit={onSubmitFilters}
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Search</span>
            <input
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Asset, owner, principal…"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Principal type</span>
            <select
              value={filters.principalType}
              onChange={(e) => setFilters((prev) => ({ ...prev, principalType: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              <option value="USER">User</option>
              <option value="GROUP">Group</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Principal name</span>
            <input
              value={filters.principalName}
              onChange={(e) => setFilters((prev) => ({ ...prev, principalName: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <div className="flex items-end gap-2 md:col-span-3">
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={onResetFilters}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]/40"
            >
              Reset
            </button>
          </div>
        </form>
      ) : null}

      <section
        className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        role="tabpanel"
        aria-labelledby={`perm-tab-${activeType}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>
            {total === 0
              ? '0 grants'
              : `${total} grant${total === 1 ? '' : 's'} · page ${safePage} of ${totalPages || 1}`}
            {hasActiveFilters ? ' · filters active' : ''}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span>Page size</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[var(--foreground)]"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <TableOptionsMenu
              columns={isAdmin ? columns : []}
              isVisible={isAdmin ? isVisible : undefined}
              toggle={isAdmin ? toggle : undefined}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters((prev) => !prev)}
            />
          </div>
        </div>

        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading permissions…</p>
        ) : pagedGroups.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">
            No permissions for {activeTab?.label?.toLowerCase() || 'this type'} match these filters.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)] lg:hidden">
              {pagedGroups.map((group) => {
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
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {group.principals.length} principal
                          {group.principals.length === 1 ? '' : 's'}
                          {group.principals.length
                            ? `: ${group.principals.map((p) => p.principalName).join(', ')}`
                            : ''}
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <AccessIconButton
                          allowed={canWrite}
                          icon="edit"
                          label="Edit permissions"
                          onClick={() => openEditForAsset(group)}
                        />
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
                    {isVisible('asset') ? (
                      <th className="px-4 py-3 font-medium">Asset</th>
                    ) : null}
                    {isVisible('owner') && isSurveyTab ? (
                      <th className="px-4 py-3 font-medium">Owner</th>
                    ) : null}
                    {isVisible('principals') ? (
                      <th className="px-4 py-3 font-medium">Principals</th>
                    ) : null}
                    {isVisible('grantedTo') ? (
                      <th className="hidden px-4 py-3 font-medium xl:table-cell">Granted to</th>
                    ) : null}
                    {isVisible('actions') ? (
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {pagedGroups.map((group) => {
                    const expanded = expandedKey === group.key;
                    const colSpan =
                      1 +
                      (isVisible('asset') ? 1 : 0) +
                      (isVisible('owner') && isSurveyTab ? 1 : 0) +
                      (isVisible('principals') ? 1 : 0) +
                      (isVisible('grantedTo') ? 1 : 0) +
                      (isVisible('actions') ? 1 : 0);
                    const summaryPrincipals = group.principals
                      .map((principal) => principal.principalName)
                      .filter(Boolean);

                    return (
                      <Fragment key={group.key}>
                        <tr
                          key={group.key}
                          className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent-soft)]/20 ${tableActionRowGroupClass}`}
                        >
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
                          {isVisible('asset') ? (
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
                          ) : null}
                          {isVisible('owner') && isSurveyTab ? (
                            <td className="px-4 py-3">{group.owner || '—'}</td>
                          ) : null}
                          {isVisible('principals') ? (
                            <td className="px-4 py-3">{group.principals.length}</td>
                          ) : null}
                          {isVisible('grantedTo') ? (
                            <td className="hidden max-w-sm px-4 py-3 text-[var(--muted)] xl:table-cell">
                              {summaryPrincipals.length ? summaryPrincipals.join(', ') : '—'}
                            </td>
                          ) : null}
                          {isVisible('actions') ? (
                            <td className="px-4 py-3 text-right">
                              <TableActionRow>
                                <AccessIconButton
                                  allowed={canWrite}
                                  icon="edit"
                                  label="Edit permissions"
                                  onClick={() => openEditForAsset(group)}
                                />
                              </TableActionRow>
                            </td>
                          ) : null}
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

        <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[var(--muted)]">
            {total === 0
              ? '0 grants'
              : `Showing page ${safePage} of ${totalPages || 1} (${total} total)`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safePage <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={totalPages === 0 || safePage >= totalPages || loading}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <PermissionModal
        isOpen={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        onApplied={async () => {
          await loadData();
          await refresh();
        }}
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
