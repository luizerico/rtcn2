"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet, apiPost, apiPut } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import { Modal } from '@/components/ui/Modal';
import { useAccess } from '@/components/AccessProvider';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import { AccessIconButton, TableActionRow, tableActionRowGroupClass } from '@/components/ui/TableActionIcon';
import { useColumnVisibility, type ColumnDef } from '@/lib/useColumnVisibility';
import { buildListParams, type PaginatedList } from '@/lib/listTypes';
import {
  geoLabel,
  type BiomeRecord,
  type CountyRecord,
  type MicroregionRecord,
  type RegionRecord,
  type StateRecord,
} from '@/lib/geoTypes';

type SortField = 'name' | 'code' | 'IBGECode' | 'state' | 'region' | 'biome' | 'microregion';
type GeoType = 'region' | 'state' | 'biome' | 'microregion' | 'county';
type BulkAction = 'assign' | 'unassign';
type GeoOption = { _id: string; code?: string; name: string; IBGECode?: string };
type PreviewCounty = Pick<CountyRecord, '_id' | 'name' | 'IBGECode' | 'code' | 'state'>;
type BulkPreview = {
  action: BulkAction;
  geoType: GeoType;
  geoId: string;
  counties: PreviewCounty[];
  addCount: number;
  removeCount: number;
};

type SurveyVersion = {
  _id: string;
  version: number;
  publishedAt?: string;
  active?: boolean;
};

interface SurveyCounties {
  _id: string;
  name: string;
  countyIds?: string[];
  currentVersionId?: string | null;
  versions?: SurveyVersion[];
}

type AssignedCounty = CountyRecord & {
  versionId?: string | null;
  version?: number | null;
  versionLocked?: boolean;
};

const COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', alwaysVisible: true },
  { id: 'version', label: 'Version', alwaysVisible: true },
  { id: 'IBGECode', label: 'IBGE' },
  { id: 'code', label: 'Code' },
  { id: 'state', label: 'State' },
  { id: 'region', label: 'Region' },
  { id: 'biome', label: 'Biome' },
  { id: 'microregion', label: 'Microregion' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

const DEFAULT_FILTERS = {
  q: '',
  regionId: '',
  stateId: '',
  biomeId: '',
  microregionId: '',
};

const GEO_TYPES: { id: GeoType; label: string; path: string }[] = [
  { id: 'region', label: 'Region', path: '/regions' },
  { id: 'state', label: 'State', path: '/states' },
  { id: 'biome', label: 'Biome', path: '/biomes' },
  { id: 'microregion', label: 'Microregion', path: '/microregions' },
  { id: 'county', label: 'County', path: '/counties' },
];

const PREVIEW_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', alwaysVisible: true },
  { id: 'IBGECode', label: 'IBGE' },
  { id: 'state', label: 'State' },
  { id: 'actions', label: 'Actions', alwaysVisible: true },
];

function optionLabel(row: GeoOption) {
  if (row.IBGECode) return `${row.IBGECode} · ${row.name}`;
  return row.code ? `${row.code} · ${row.name}` : row.name;
}

function versionOptionLabel(row: SurveyVersion) {
  return `v${row.version}${row.publishedAt ? ` · ${new Date(row.publishedAt).toLocaleDateString()}` : ''}`;
}

function BulkCountyPreviewModal({
  preview,
  placeLabel,
  isAdmin,
  canWrite,
  busy,
  onClose,
  onConfirm,
}: {
  preview: BulkPreview;
  placeLabel: string;
  isAdmin: boolean;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (countyIds: string[]) => void;
}) {
  const isAssign = preview.action === 'assign';
  const [counties, setCounties] = useState(preview.counties);
  const empty = counties.length === 0;
  const useListChrome = counties.length >= 10;
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [sort, setSort] = useState<'name' | 'IBGECode'>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const columns = useMemo(() => PREVIEW_COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('admin-survey-counties-preview', columns, {
    enabled: isAdmin && useListChrome,
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = needle
      ? counties.filter((row) => {
          const state = geoLabel(row.state).toLowerCase();
          return (
            row.name.toLowerCase().includes(needle) ||
            (row.IBGECode || '').toLowerCase().includes(needle) ||
            (row.code || '').toLowerCase().includes(needle) ||
            state.includes(needle)
          );
        })
      : counties;
    return [...rows].sort((a, b) => {
      const av = sort === 'IBGECode' ? a.IBGECode || '' : a.name;
      const bv = sort === 'IBGECode' ? b.IBGECode || '' : b.name;
      return av.localeCompare(bv) * (order === 'asc' ? 1 : -1);
    });
  }, [counties, order, q, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const safePage = Math.min(page, totalPages);
  const pageRows = useListChrome ? filtered.slice((safePage - 1) * limit, safePage * limit) : filtered;

  useEffect(() => {
    setCounties(preview.counties);
  }, [preview]);

  useEffect(() => {
    setPage(1);
  }, [q, limit]);

  const excludeCounty = (countyId: string) => {
    setCounties((prev) => prev.filter((row) => row._id !== countyId));
  };

  const toggleSort = (field: 'name' | 'IBGECode') => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder('asc');
    }
    setPage(1);
  };

  const sortIndicator = (field: 'name' | 'IBGECode') => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  const emptyMessage = isAssign ? 'No counties to assign' : 'No assigned counties to remove';
  const title = isAssign ? 'Confirm assign' : 'Confirm unassign';
  const confirmLabel = isAssign ? 'Confirm assign' : 'Confirm unassign';
  const excludeLabel = isAssign
    ? 'Remove from this assignment'
    : 'Remove from this unassignment';
  const count = counties.length;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      size="xl"
      scrollBody={false}
      closeOnBackdrop={!busy}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <p className="text-sm text-[var(--muted)]">
          {empty
            ? emptyMessage
            : `${isAssign ? 'Assign' : 'Unassign'} ${count} ${count === 1 ? 'county' : 'counties'} in ${placeLabel}. This does not publish a new version.`}
        </p>

        {empty ? null : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)]">
            {useListChrome ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
                <span>
                  {filtered.length} {filtered.length === 1 ? 'county' : 'counties'}
                  {q.trim() ? ' · search active' : ''}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <span>Page size</span>
                    <select
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
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
            ) : null}

            {useListChrome && showFilters ? (
              <div className="border-b border-[var(--border)] px-3 py-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-[var(--muted)]">Search</span>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Name, IBGE, or state…"
                    className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
                  />
                </label>
              </div>
            ) : null}

            {pageRows.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted)]">No counties match your search.</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                    <tr>
                      {isVisible('name') ? (
                        <th className="px-3 py-2 font-medium">
                          {useListChrome ? (
                            <button
                              type="button"
                              onClick={() => toggleSort('name')}
                              className="hover:text-[var(--foreground)]"
                            >
                              Name{sortIndicator('name')}
                            </button>
                          ) : (
                            'Name'
                          )}
                        </th>
                      ) : null}
                      {isVisible('IBGECode') ? (
                        <th className="px-3 py-2 font-medium">
                          {useListChrome ? (
                            <button
                              type="button"
                              onClick={() => toggleSort('IBGECode')}
                              className="hover:text-[var(--foreground)]"
                            >
                              IBGE{sortIndicator('IBGECode')}
                            </button>
                          ) : (
                            'IBGE'
                          )}
                        </th>
                      ) : null}
                      {isVisible('state') ? <th className="px-3 py-2 font-medium">State</th> : null}
                      {isVisible('actions') ? (
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr
                        key={row._id}
                        className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                      >
                        {isVisible('name') ? (
                          <td className="px-3 py-2 font-medium">{row.name}</td>
                        ) : null}
                        {isVisible('IBGECode') ? (
                          <td className="px-3 py-2">{row.IBGECode || '—'}</td>
                        ) : null}
                        {isVisible('state') ? (
                          <td className="px-3 py-2">{geoLabel(row.state)}</td>
                        ) : null}
                        {isVisible('actions') ? (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <TableActionRow>
                              <AccessIconButton
                                allowed={canWrite}
                                icon="delete"
                                label={`${excludeLabel} · ${row.name}`}
                                danger
                                disabled={busy}
                                onClick={() => excludeCounty(row._id)}
                              />
                            </TableActionRow>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {useListChrome ? (
              <div className="flex flex-col gap-2 border-t border-[var(--border)] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[var(--muted)]">
                  Showing page {safePage} of {totalPages} ({filtered.length} total)
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((prev) => prev + 1)}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={empty || busy}
            onClick={() => onConfirm(counties.map((row) => row._id))}
            className={
              isAssign
                ? 'rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60'
                : 'rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60'
            }
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AssignSurveyCountiesPage() {
  const params = useParams<{ id: string }>();
  const surveyId = params.id;
  const { pushToast } = useToast();
  const { can, isAdmin } = useAccess();
  const canWrite = can('SURVEY:WRITE', { resourceId: surveyId });

  const [survey, setSurvey] = useState<SurveyCounties | null>(null);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(true);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortField>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const [data, setData] = useState<PaginatedList<AssignedCounty> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [regionOptions, setRegionOptions] = useState<RegionRecord[]>([]);
  const [stateOptions, setStateOptions] = useState<StateRecord[]>([]);
  const [biomeOptions, setBiomeOptions] = useState<BiomeRecord[]>([]);
  const [microregionOptions, setMicroregionOptions] = useState<MicroregionRecord[]>([]);

  const [geoType, setGeoType] = useState<GeoType>('region');
  const [geoId, setGeoId] = useState('');
  const [geoQuery, setGeoQuery] = useState('');
  const [geoStateId, setGeoStateId] = useState('');
  const [geoOptions, setGeoOptions] = useState<GeoOption[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [bulkVersionId, setBulkVersionId] = useState('');
  const [savingCountyId, setSavingCountyId] = useState<string | null>(null);

  const [pendingUnassign, setPendingUnassign] = useState<CountyRecord | null>(null);
  const [unassigning, setUnassigning] = useState(false);

  const columns = useMemo(() => COLUMNS, []);
  const { isVisible, toggle } = useColumnVisibility('admin-survey-counties', columns, {
    enabled: isAdmin,
  });

  const hasActiveFilters = Object.values(applied).some(Boolean);
  const rows = data?.items || [];
  const pagination = data?.pagination;
  const selectedGeo = geoOptions.find((row) => row._id === geoId);
  const geoTypeLabel = GEO_TYPES.find((row) => row.id === geoType)?.label || 'geography';
  const surveyVersions = survey?.versions || [];

  useEffect(() => {
    if (survey?.currentVersionId) setBulkVersionId(survey.currentVersionId);
  }, [survey?.currentVersionId]);

  const loadSurvey = useCallback(async () => {
    setSurveyLoading(true);
    setSurveyError(null);
    try {
      setSurvey(await apiGet<SurveyCounties>(`/surveys/${surveyId}`));
    } catch (err) {
      setSurvey(null);
      setSurveyError(err instanceof Error ? err.message : 'Failed to load survey.');
    } finally {
      setSurveyLoading(false);
    }
  }, [surveyId]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildListParams({ page, limit, sort, order, filters: applied });
      setData(await apiGet<PaginatedList<AssignedCounty>>(`/surveys/${surveyId}/counties?${params}`));
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to load assigned counties.');
    } finally {
      setLoading(false);
    }
  }, [applied, limit, order, page, sort, surveyId]);

  const loadFilterOptions = useCallback(async () => {
    try {
      const [regions, states, biomes] = await Promise.all([
        apiGet<PaginatedList<RegionRecord>>('/regions?limit=100&sort=name&order=asc'),
        apiGet<PaginatedList<StateRecord>>('/states?limit=100&sort=name&order=asc'),
        apiGet<PaginatedList<BiomeRecord>>('/biomes?limit=100&sort=name&order=asc'),
      ]);
      setRegionOptions(regions.items || []);
      setStateOptions(states.items || []);
      setBiomeOptions(biomes.items || []);
    } catch {
      // Non-fatal for the assigned table.
    }
  }, []);

  useEffect(() => {
    void loadSurvey();
  }, [loadSurvey]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    let cancelled = false;
    async function loadMicros() {
      try {
        const params = new URLSearchParams({ limit: '100', sort: 'name', order: 'asc' });
        if (filters.stateId) params.set('stateId', filters.stateId);
        const result = await apiGet<PaginatedList<MicroregionRecord>>(`/microregions?${params}`);
        if (!cancelled) setMicroregionOptions(result.items || []);
      } catch {
        if (!cancelled) setMicroregionOptions([]);
      }
    }
    void loadMicros();
    return () => {
      cancelled = true;
    };
  }, [filters.stateId]);

  useEffect(() => {
    let cancelled = false;
    const spec = GEO_TYPES.find((row) => row.id === geoType);
    if (!spec) return undefined;

    const handle = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: '100', sort: 'name', order: 'asc' });
        if (geoQuery.trim()) params.set('q', geoQuery.trim());
        if ((geoType === 'microregion' || geoType === 'county') && geoStateId) {
          params.set('stateId', geoStateId);
        }
        const result = await apiGet<PaginatedList<GeoOption>>(`${spec.path}?${params}`);
        if (cancelled) return;
        setGeoOptions(result.items || []);
      } catch {
        if (!cancelled) setGeoOptions([]);
      }
    }, geoQuery ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [geoQuery, geoStateId, geoType]);

  const refresh = async () => {
    await Promise.all([loadSurvey(), loadRows()]);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const onReset = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setSort('name');
    setOrder('asc');
    setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder('asc');
    }
    setPage(1);
  };

  const sortIndicator = (field: SortField) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  const patchAssignedRow = (countyId: string, patch: Partial<AssignedCounty>) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((row) => (row._id === countyId ? { ...row, ...patch } : row)),
      };
    });
  };

  const handleUnassignOne = async () => {
    if (!pendingUnassign || !survey) return;
    setUnassigning(true);
    try {
      const next = (survey.countyIds || []).filter((id) => id !== pendingUnassign._id);
      await apiPut(`/surveys/${surveyId}/counties`, { countyIds: next });
      pushToast({
        tone: 'success',
        title: 'County unassigned',
        message: `${pendingUnassign.name} was removed without publishing a new version.`,
      });
      setPendingUnassign(null);
      await refresh();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Unassign failed',
        message: err instanceof Error ? err.message : 'Could not unassign this county.',
      });
    } finally {
      setUnassigning(false);
    }
  };

  const handleCountyVersion = async (county: AssignedCounty, versionId: string) => {
    if (!canWrite || !versionId || versionId === county.versionId || county.versionLocked) return;
    const previous = { versionId: county.versionId, version: county.version };
    const nextVersion = surveyVersions.find((row) => row._id === versionId);
    patchAssignedRow(county._id, {
      versionId,
      version: nextVersion?.version ?? county.version,
    });
    setSavingCountyId(county._id);
    try {
      await apiPut(`/surveys/${surveyId}/counties/${county._id}`, { versionId });
      pushToast({
        tone: 'success',
        title: 'County version updated',
        message: `${county.name} will use the selected version for new answers.`,
      });
    } catch (err) {
      patchAssignedRow(county._id, previous);
      pushToast({
        tone: 'error',
        title: 'Could not change version',
        message: err instanceof Error ? err.message : 'Request failed.',
      });
    } finally {
      setSavingCountyId(null);
    }
  };

  const loadPreview = async (action: BulkAction) => {
    if (!geoId) return;
    setPreviewLoading(true);
    try {
      setPreview(
        await apiPost<BulkPreview>(`/surveys/${surveyId}/counties/bulk/preview`, {
          action,
          geoType,
          geoId,
        })
      );
    } catch (err) {
      setPreview(null);
      pushToast({
        tone: 'error',
        title: 'Preview failed',
        message: err instanceof Error ? err.message : 'Could not load counties for this geography.',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmBulk = async (countyIds: string[]) => {
    if (!preview || !geoId || countyIds.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await apiPost<{ matchedCountyCount?: number; changedCount?: number }>(
        `/surveys/${surveyId}/counties/bulk`,
        {
          action: preview.action,
          geoType: preview.geoType,
          geoId: preview.geoId,
          countyIds,
          ...(preview.action === 'assign' && bulkVersionId ? { versionId: bulkVersionId } : {}),
        }
      );
      const place = selectedGeo ? optionLabel(selectedGeo) : geoTypeLabel.toLowerCase();
      const matched = result.matchedCountyCount ?? 0;
      const changed = result.changedCount ?? 0;
      pushToast({
        tone: 'success',
        title: preview.action === 'assign' ? 'Counties assigned' : 'Counties unassigned',
        message:
          matched === 0
            ? `No counties found in that ${geoTypeLabel.toLowerCase()}.`
            : `${preview.action === 'assign' ? 'Added' : 'Removed'} ${changed} of ${matched} counties in ${place}. Assignment was saved without publishing.`,
      });
      setPreview(null);
      await refresh();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: preview.action === 'assign' ? 'Assign failed' : 'Unassign failed',
        message: err instanceof Error ? err.message : 'Could not update assigned counties.',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const countyVersionControl = (row: AssignedCounty) => {
    if (surveyVersions.length === 0) {
      return <span className="text-sm text-[var(--muted)]">{row.version ? `v${row.version}` : '—'}</span>;
    }
    return (
      <select
        value={row.versionId || ''}
        disabled={!canWrite || Boolean(row.versionLocked) || savingCountyId === row._id}
        onChange={(event) => void handleCountyVersion(row, event.target.value)}
        title={
          row.versionLocked
            ? 'This county already has a sheet, so its version cannot change'
            : 'Version for new answers'
        }
        aria-label={`Version for ${row.name}`}
        className="w-full max-w-[11rem] rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm disabled:opacity-60"
      >
        {surveyVersions.map((version) => (
          <option key={version._id} value={version._id}>
            {`v${version.version}`}
          </option>
        ))}
      </select>
    );
  };

  if (surveyLoading) {
    return <p className="text-[var(--muted)]">Loading survey…</p>;
  }

  if (surveyError || !survey) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Surveys', href: '/admin/surveys' },
            { label: 'Assign counties' },
          ]}
        />
        <p className="text-red-700">{surveyError || 'Survey not found.'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Surveys', href: '/admin/surveys' },
            { label: survey.name, href: `/admin/surveys/${survey._id}` },
            { label: 'Assign counties' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Assign counties · {survey.name}</h1>
        <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
          County sheets are only available for counties listed here. Each county uses one published
          version. Assigning or unassigning does not publish a new instrument version.
        </p>
      </header>

      {canWrite ? (
        <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <h2 className="text-sm font-medium">Bulk assign by geography</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Add or remove every county in a region, state, biome, microregion, or a single county.
              Assign uses the version selected below for counties that are not already listed.
            </p>
          </div>
          <div
            className={`grid w-full gap-3 ${
              geoType === 'microregion' || geoType === 'county'
                ? 'sm:grid-cols-2 lg:grid-cols-4'
                : 'sm:grid-cols-3'
            }`}
          >
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Geography type</span>
              <select
                value={geoType}
                onChange={(e) => {
                  setGeoType(e.target.value as GeoType);
                  setGeoId('');
                  setGeoQuery('');
                  setGeoStateId('');
                  setPreview(null);
                }}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
              >
                {GEO_TYPES.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            {geoType === 'microregion' || geoType === 'county' ? (
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="text-[var(--muted)]">State (optional)</span>
                <select
                  value={geoStateId}
                  onChange={(e) => {
                    setGeoStateId(e.target.value);
                    setGeoId('');
                    setPreview(null);
                  }}
                  className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
                >
                  <option value="">All states</option>
                  {stateOptions.map((state) => (
                    <option key={state._id} value={state._id}>
                      {optionLabel(state)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Search {geoTypeLabel.toLowerCase()}</span>
              <input
                value={geoQuery}
                onChange={(e) => setGeoQuery(e.target.value)}
                placeholder={`Filter ${geoTypeLabel.toLowerCase()}s…`}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">{geoTypeLabel}</span>
              <select
                value={geoId}
                onChange={(e) => {
                  setGeoId(e.target.value);
                  setPreview(null);
                }}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
              >
                <option value="">Select…</option>
                {geoOptions.map((row) => (
                  <option key={row._id} value={row._id}>
                    {optionLabel(row)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {surveyVersions.length > 0 ? (
            <label className="flex min-w-0 max-w-md flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Version for newly assigned counties</span>
              <select
                value={bulkVersionId}
                onChange={(e) => setBulkVersionId(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
              >
                {surveyVersions.map((row) => (
                  <option key={row._id} value={row._id}>
                    {versionOptionLabel(row)}
                    {row._id === survey.currentVersionId ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={!geoId || previewLoading || bulkBusy}
              onClick={() => void loadPreview('unassign')}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)] disabled:opacity-60"
            >
              {previewLoading ? 'Loading preview…' : 'Preview unassign'}
            </button>
            <AccessPrimaryButton
              allowed={canWrite}
              disabled={!geoId || previewLoading || bulkBusy}
              onClick={() => void loadPreview('assign')}
            >
              {previewLoading ? 'Loading preview…' : 'Preview assign'}
            </AccessPrimaryButton>
          </div>
        </section>
      ) : null}

      {showFilters ? (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--muted)]">Search</span>
            <input
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Name, code, or IBGE…"
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Region</span>
            <select
              value={filters.regionId}
              onChange={(e) => setFilters((prev) => ({ ...prev, regionId: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {regionOptions.map((region) => (
                <option key={region._id} value={region._id}>
                  {optionLabel(region)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">State</span>
            <select
              value={filters.stateId}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, stateId: e.target.value, microregionId: '' }))
              }
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {stateOptions.map((state) => (
                <option key={state._id} value={state._id}>
                  {optionLabel(state)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Biome</span>
            <select
              value={filters.biomeId}
              onChange={(e) => setFilters((prev) => ({ ...prev, biomeId: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {biomeOptions.map((biome) => (
                <option key={biome._id} value={biome._id}>
                  {optionLabel(biome)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Microregion</span>
            <select
              value={filters.microregionId}
              onChange={(e) => setFilters((prev) => ({ ...prev, microregionId: e.target.value }))}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2"
            >
              <option value="">All</option>
              {microregionOptions.map((micro) => (
                <option key={micro._id} value={micro._id}>
                  {optionLabel(micro)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 md:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]/40"
            >
              Reset
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          <span>
            {pagination
              ? pagination.total === 0
                ? '0 assigned counties'
                : `${pagination.total} assigned ${pagination.total === 1 ? 'county' : 'counties'} · page ${pagination.page} of ${pagination.totalPages}`
              : '—'}
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
          <p className="p-5 text-[var(--muted)]">Loading assigned counties…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">
            {hasActiveFilters
              ? 'No assigned counties match your filters.'
              : 'No counties are assigned to this instrument yet.'}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)] md:hidden">
              {rows.map((row) => (
                <li key={row._id} className="space-y-3 p-4">
                  <div>
                    <p className="font-medium break-words">{row.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      IBGE {row.IBGECode || '—'} · {geoLabel(row.state)}
                    </p>
                    <div className="mt-2">{countyVersionControl(row)}</div>
                  </div>
                  <TableActionRow alwaysVisible>
                    <AccessIconButton
                      allowed={canWrite}
                      icon="delete"
                      label={`Unassign ${row.name}`}
                      danger
                      onClick={() => setPendingUnassign(row)}
                    />
                  </TableActionRow>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
                  <tr>
                    {isVisible('name') ? (
                      <th className="px-4 py-3 font-medium">
                        <button type="button" onClick={() => toggleSort('name')} className="hover:text-[var(--foreground)]">
                          Name{sortIndicator('name')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('version') ? <th className="px-4 py-3 font-medium">Version</th> : null}
                    {isVisible('IBGECode') ? (
                      <th className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort('IBGECode')}
                          className="hover:text-[var(--foreground)]"
                        >
                          IBGE{sortIndicator('IBGECode')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('code') ? (
                      <th className="px-4 py-3 font-medium">
                        <button type="button" onClick={() => toggleSort('code')} className="hover:text-[var(--foreground)]">
                          Code{sortIndicator('code')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('state') ? (
                      <th className="px-4 py-3 font-medium">
                        <button type="button" onClick={() => toggleSort('state')} className="hover:text-[var(--foreground)]">
                          State{sortIndicator('state')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('region') ? (
                      <th className="px-4 py-3 font-medium">
                        <button type="button" onClick={() => toggleSort('region')} className="hover:text-[var(--foreground)]">
                          Region{sortIndicator('region')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('biome') ? (
                      <th className="px-4 py-3 font-medium">
                        <button type="button" onClick={() => toggleSort('biome')} className="hover:text-[var(--foreground)]">
                          Biome{sortIndicator('biome')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('microregion') ? (
                      <th className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort('microregion')}
                          className="hover:text-[var(--foreground)]"
                        >
                          Microregion{sortIndicator('microregion')}
                        </button>
                      </th>
                    ) : null}
                    {isVisible('actions') ? (
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row._id}
                      className={`border-b border-[var(--border)] last:border-0 ${tableActionRowGroupClass}`}
                    >
                      {isVisible('name') ? <td className="px-4 py-3 font-medium">{row.name}</td> : null}
                      {isVisible('version') ? <td className="px-4 py-3">{countyVersionControl(row)}</td> : null}
                      {isVisible('IBGECode') ? (
                        <td className="px-4 py-3">{row.IBGECode || '—'}</td>
                      ) : null}
                      {isVisible('code') ? <td className="px-4 py-3">{row.code || '—'}</td> : null}
                      {isVisible('state') ? <td className="px-4 py-3">{geoLabel(row.state)}</td> : null}
                      {isVisible('region') ? <td className="px-4 py-3">{geoLabel(row.region)}</td> : null}
                      {isVisible('biome') ? <td className="px-4 py-3">{geoLabel(row.biome)}</td> : null}
                      {isVisible('microregion') ? (
                        <td className="px-4 py-3">{geoLabel(row.microregion)}</td>
                      ) : null}
                      {isVisible('actions') ? (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <TableActionRow>
                            <AccessIconButton
                              allowed={canWrite}
                              icon="delete"
                              label={`Unassign ${row.name}`}
                              danger
                              onClick={() => setPendingUnassign(row)}
                            />
                          </TableActionRow>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[var(--muted)]">
            {pagination
              ? pagination.total === 0
                ? '0 assigned counties'
                : `Showing page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)`
              : '—'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!pagination?.hasPrev || loading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!pagination?.hasNext || loading}
              onClick={() => setPage((prev) => prev + 1)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <Link
          href="/admin/surveys"
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
        >
          Back
        </Link>
      </div>

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingUnassign)}
        onClose={() => setPendingUnassign(null)}
        onConfirm={handleUnassignOne}
        title="Unassign county"
        itemLabel={pendingUnassign?.name}
        description={
          pendingUnassign
            ? `Unassign “${pendingUnassign.name}” from this instrument? Existing sheets stay available.`
            : undefined
        }
        confirmLabel="Unassign"
        busy={unassigning}
      />

      {preview ? (
        <BulkCountyPreviewModal
          preview={preview}
          placeLabel={selectedGeo ? optionLabel(selectedGeo) : geoTypeLabel.toLowerCase()}
          isAdmin={isAdmin}
          canWrite={canWrite}
          busy={bulkBusy}
          onClose={() => {
            if (!bulkBusy) setPreview(null);
          }}
          onConfirm={(countyIds) => void confirmBulk(countyIds)}
        />
      ) : null}
    </div>
  );
}
