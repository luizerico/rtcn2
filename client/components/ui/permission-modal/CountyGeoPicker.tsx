'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/apiUtils';
import type { PaginatedList } from '@/lib/listTypes';
import { matchesAssetFilter } from './assetFilter';
import type { CatalogObject } from './types';

type GeoType = 'region' | 'state' | 'biome' | 'microregion' | 'county';

type GeoOption = {
  _id: string;
  name: string;
  code?: string;
  IBGECode?: string;
};

type CountyOption = {
  _id: string;
  name: string;
  IBGECode?: string;
};

const GEO_TYPES: Array<{
  id: GeoType;
  label: string;
  path: string;
  filter: string;
  plural: string;
}> = [
  { id: 'region', label: 'Region', path: '/regions', filter: 'regionId', plural: 'regions' },
  { id: 'state', label: 'State', path: '/states', filter: 'stateId', plural: 'states' },
  { id: 'biome', label: 'Biome', path: '/biomes', filter: 'biomeId', plural: 'biomes' },
  {
    id: 'microregion',
    label: 'Microregion',
    path: '/microregions',
    filter: 'microregionId',
    plural: 'microregions',
  },
  { id: 'county', label: 'County', path: '/counties', filter: '', plural: 'counties' },
];

async function fetchCounties(params: URLSearchParams): Promise<CountyOption[]> {
  const result = await apiGet<PaginatedList<CountyOption>>(`/counties?${params.toString()}`);
  return result.items || [];
}

function optionLabel(row: GeoOption) {
  if (row.IBGECode) return `${row.IBGECode} · ${row.name}`;
  return row.code ? `${row.code} · ${row.name}` : row.name;
}

function countyObject(row: CountyOption): CatalogObject {
  return {
    id: String(row._id),
    name: row.name,
    label: row.IBGECode ? `${row.name} (${row.IBGECode})` : row.name,
  };
}

interface CountyGeoPickerProps {
  selectionLocked: boolean;
  aclLoading: boolean;
  selectedIds: string[];
  selectedObjects: CatalogObject[];
  initialResourceId: string | null;
  onReplaceObjects: (objects: CatalogObject[]) => void;
  onAddObjects: (objects: CatalogObject[]) => void;
  onToggleObject: (id: string) => void;
}

export function CountyGeoPicker({
  selectionLocked,
  aclLoading,
  selectedIds,
  selectedObjects,
  initialResourceId,
  onReplaceObjects,
  onAddObjects,
  onToggleObject,
}: CountyGeoPickerProps) {
  const [geoType, setGeoType] = useState<GeoType>('region');
  const [geoQuery, setGeoQuery] = useState('');
  const [geoId, setGeoId] = useState('');
  const [geoStateId, setGeoStateId] = useState('');
  const [geoOptions, setGeoOptions] = useState<GeoOption[]>([]);
  const [stateOptions, setStateOptions] = useState<GeoOption[]>([]);
  const [assetFilter, setAssetFilter] = useState('');
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [loadingCounties, setLoadingCounties] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const spec = GEO_TYPES.find((row) => row.id === geoType) || GEO_TYPES[0];
  const visibleObjects = useMemo(
    () => selectedObjects.filter((object) => matchesAssetFilter(object, assetFilter)),
    [assetFilter, selectedObjects]
  );

  useEffect(() => {
    if (!selectionLocked || !initialResourceId) return;
    if (selectedObjects.some((object) => object.id === initialResourceId)) return;

    let cancelled = false;
    apiGet<CountyOption>(`/counties/${initialResourceId}`)
      .then((county) => {
        if (cancelled || !county?._id) return;
        onReplaceObjects([countyObject(county)]);
      })
      .catch(() => {
        if (!cancelled) {
          onReplaceObjects([
            { id: initialResourceId, name: initialResourceId, label: initialResourceId },
          ]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialResourceId, onReplaceObjects, selectedObjects, selectionLocked]);

  useEffect(() => {
    if (selectionLocked || geoType !== 'microregion') {
      setStateOptions([]);
      return;
    }
    let cancelled = false;
    apiGet<PaginatedList<GeoOption>>('/states?limit=100&sort=name&order=asc')
      .then((result) => {
        if (!cancelled) setStateOptions(result.items || []);
      })
      .catch(() => {
        if (!cancelled) setStateOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [geoType, selectionLocked]);

  useEffect(() => {
    if (selectionLocked) return undefined;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoadingPlaces(true);
      try {
        const params = new URLSearchParams({ limit: '100', sort: 'name', order: 'asc' });
        if (geoQuery.trim()) params.set('q', geoQuery.trim());
        if (geoType === 'microregion' && geoStateId) params.set('stateId', geoStateId);
        const items =
          spec.path === '/counties'
            ? await fetchCounties(params)
            : (await apiGet<PaginatedList<GeoOption>>(`${spec.path}?${params.toString()}`)).items ||
              [];
        if (cancelled) return;
        setGeoOptions(items);
      } catch {
        if (!cancelled) setGeoOptions([]);
      } finally {
        if (!cancelled) setLoadingPlaces(false);
      }
    }, geoQuery ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [geoQuery, geoStateId, geoType, selectionLocked, spec.path]);

  const loadCountiesForPlace = async (placeId: string, nextType: GeoType) => {
    if (!placeId) return;
    const nextSpec = GEO_TYPES.find((row) => row.id === nextType) || GEO_TYPES[0];
    setLoadingCounties(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        limit: '10000',
        sort: 'name',
        order: 'asc',
      });
      if (nextSpec.filter) params.set(nextSpec.filter, placeId);
      const items = await fetchCounties(params);
      onReplaceObjects(items.map(countyObject));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load counties.');
    } finally {
      setLoadingCounties(false);
    }
  };

  const selectPlace = (placeId: string, nextType: GeoType) => {
    setGeoId(placeId);
    if (!placeId) return;
    if (nextType === 'county') {
      const row = geoOptions.find((option) => option._id === placeId);
      if (row) onAddObjects([countyObject(row)]);
      return;
    }
    void loadCountiesForPlace(placeId, nextType);
  };

  if (selectionLocked) {
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Asset</legend>
        <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] p-3">
          {selectedObjects.length === 0 ? (
            <p className="text-sm font-medium">{initialResourceId || 'Selected county'}</p>
          ) : (
            selectedObjects.map((object) => (
              <p key={object.id} className="text-sm font-medium">
                {object.label || object.name}
              </p>
            ))
          )}
        </div>
        {aclLoading ? <p className="mt-2 text-xs text-[var(--muted)]">Loading permissions…</p> : null}
      </fieldset>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={`grid w-full gap-3 ${
          geoType === 'microregion' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'
        }`}
      >
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Geography type</span>
          <select
            value={geoType}
            onChange={(event) => {
              setGeoType(event.target.value as GeoType);
              setGeoId('');
              setGeoQuery('');
              setGeoStateId('');
              setGeoOptions([]);
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
        {geoType === 'microregion' ? (
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">State (optional)</span>
            <select
              value={geoStateId}
              onChange={(event) => {
                setGeoStateId(event.target.value);
                setGeoId('');
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
          <span className="text-[var(--muted)]">Search {spec.label.toLowerCase()}</span>
          <input
            value={geoQuery}
            onChange={(event) => setGeoQuery(event.target.value)}
            placeholder={`Filter ${spec.plural}…`}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">{spec.label}</span>
          <select
            aria-label={spec.label}
            value={geoId}
            onChange={(event) => selectPlace(event.target.value, geoType)}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          >
            <option value="">{loadingPlaces ? 'Loading…' : 'Select…'}</option>
            {geoOptions.map((row) => (
              <option key={row._id} value={row._id}>
                {optionLabel(row)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          Select assets{selectedObjects.length ? ` (${selectedObjects.length})` : ''}
        </legend>
        {selectedObjects.length > 0 ? (
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
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-[var(--border)] p-3">
          {loadingCounties ? (
            <p className="text-sm text-[var(--muted)]">Loading counties…</p>
          ) : loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : selectedObjects.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Select a region, state, biome, microregion, or county to list assets.
            </p>
          ) : !visibleObjects.length ? (
            <p className="text-sm text-[var(--muted)]">No matching assets.</p>
          ) : (
            visibleObjects.map((object) => (
              <label key={object.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(object.id)}
                  onChange={() => onToggleObject(object.id)}
                  className="mt-0.5"
                />
                <span className="font-medium">{object.label || object.name}</span>
              </label>
            ))
          )}
        </div>
        {aclLoading ? <p className="mt-2 text-xs text-[var(--muted)]">Loading permissions…</p> : null}
      </fieldset>
    </div>
  );
}
