"use client";

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/apiUtils';
import { type PaginatedList } from '@/lib/listTypes';
import { type GeoAmendmentRecord, type GeoDisasterRecord, type GeoIndicatorRecord } from '@/lib/geoTypes';
import SortableDetailTable, { type SortableColumn } from '@/components/geo/SortableDetailTable';

const SOURCE_PANELS: Array<{
  source: string;
  title: string;
  kinds: Array<'county' | 'state' | 'region'>;
}> = [
  { source: 'pib', title: 'GDP and value added', kinds: ['county', 'state', 'region'] },
  { source: 'pam', title: 'Agriculture (PAM)', kinds: ['county', 'state', 'region'] },
  { source: 'ppm', title: 'Livestock (PPM)', kinds: ['county', 'state', 'region'] },
  { source: 'cempre', title: 'Industry — local units (CEMPRE)', kinds: ['county', 'state', 'region'] },
  { source: 'pia', title: 'Industry — PIA', kinds: ['state', 'region'] },
  { source: 'munic', title: 'Disaster survey (MUNIC)', kinds: ['county', 'state', 'region'] },
  { source: 'siconfi', title: 'Government accounts (SICONFI)', kinds: ['county', 'state', 'region'] },
  { source: 'transfers', title: 'Constitutional transfers', kinds: ['county', 'state', 'region'] },
  { source: 'emendas', title: 'Parliamentary amendments', kinds: ['county', 'state', 'region'] },
];

const SERIES_LABELS: Record<string, string> = {
  gdp: 'GDP',
  vab_total: 'VAB total',
  vab_agro: 'VAB agropecuária',
  vab_industry: 'VAB industry',
  vab_services: 'VAB services',
  vab_admin: 'VAB public admin',
  crop_value: 'Crop value',
  crop_area: 'Harvested area',
  crop_qty: 'Production quantity',
  herd: 'Herd',
  local_units: 'Local units',
  enterprises: 'Enterprises',
  occupied: 'Occupied personnel',
  industry_transform: 'Industrial transformation value',
  flood: 'Floods (last 4 years)',
  flash_flood: 'Flash floods (last 4 years)',
  landslide: 'Landslides (last 4 years)',
  revenue_total: 'Total revenue',
  revenue_transfers: 'Current transfers (revenue)',
  expense_committed: 'Expenses committed',
  expense_paid: 'Expenses paid',
  expense_personnel: 'Personnel expenses',
  fpm: 'FPM',
  fpe: 'FPE',
  fundeb: 'FUNDEB',
  itr: 'ITR',
  emenda_committed: 'Amendments committed',
  emenda_paid: 'Amendments paid',
};

function seriesLabel(series: string): string {
  return SERIES_LABELS[series] || series;
}

function isCurrencySymbol(unit: string): boolean {
  return /^(R\$|US\$|\$|€|£)$/.test(unit.trim());
}

function formatValue(value: number, unit?: string): string {
  const formatted = Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (!unit) return formatted;
  return isCurrencySymbol(unit) ? `${unit} ${formatted}` : `${formatted} ${unit}`;
}

const INDICATOR_COLUMNS: Array<SortableColumn<GeoIndicatorRecord>> = [
  {
    id: 'year',
    label: 'Year',
    type: 'number',
    getValue: (row) => row.year,
    className: 'tabular-nums',
  },
  {
    id: 'series',
    label: 'Series',
    type: 'text',
    getValue: (row) => seriesLabel(row.series),
  },
  {
    id: 'category',
    label: 'Category',
    type: 'text',
    getValue: (row) => row.category || '',
    format: (row) => row.category || '—',
  },
  {
    id: 'value',
    label: 'Value',
    type: 'number',
    getValue: (row) => row.value,
    format: (row) => formatValue(row.value, row.unit),
    className: 'tabular-nums',
  },
];

const AMENDMENT_COLUMNS: Array<SortableColumn<GeoAmendmentRecord>> = [
  {
    id: 'year',
    label: 'Year',
    type: 'number',
    getValue: (row) => row.year,
    className: 'tabular-nums',
  },
  {
    id: 'author',
    label: 'Author',
    type: 'text',
    getValue: (row) => row.author || '',
    format: (row) => row.author || '—',
  },
  {
    id: 'type',
    label: 'Type',
    type: 'text',
    getValue: (row) => row.amendmentType || '',
    format: (row) => row.amendmentType || '—',
    className: 'capitalize',
    defaultVisible: false,
  },
  {
    id: 'target',
    label: 'Target',
    type: 'text',
    getValue: (row) => row.target || '',
    format: (row) => row.target || '—',
  },
  {
    id: 'function',
    label: 'Function',
    type: 'text',
    getValue: (row) => row.function || row.functionName || '',
    format: (row) => row.function || row.functionName || '—',
  },
  {
    id: 'subfunction',
    label: 'Subfunction',
    type: 'text',
    getValue: (row) => row.subfunction || row.subfunctionName || '',
    format: (row) => row.subfunction || row.subfunctionName || '—',
  },
  {
    id: 'group',
    label: 'Group',
    type: 'text',
    getValue: (row) => row.grupo || row.expenseGroup || '',
    format: (row) => row.grupo || row.expenseGroup || '—',
  },
  {
    id: 'purpose',
    label: 'Purpose',
    type: 'text',
    getValue: (row) => row.purpose || '',
    format: (row) => row.purpose || '—',
  },
  {
    id: 'action',
    label: 'Action',
    type: 'text',
    getValue: (row) => row.action || row.actionName || '',
    format: (row) => row.action || row.actionName || '—',
  },
  {
    id: 'committed',
    label: 'Committed',
    type: 'number',
    getValue: (row) => row.committed ?? null,
    format: (row) => (row.committed == null ? '—' : formatValue(row.committed, 'R$')),
    className: 'tabular-nums',
  },
  {
    id: 'paid',
    label: 'Paid',
    type: 'number',
    getValue: (row) => row.paid ?? null,
    format: (row) => (row.paid == null ? '—' : formatValue(row.paid, 'R$')),
    className: 'tabular-nums',
  },
];

const DISASTER_COLUMNS: Array<SortableColumn<GeoDisasterRecord>> = [
  {
    id: 'date',
    label: 'Date',
    type: 'date',
    getValue: (row) => row.occurredAt || '',
    format: (row) => (row.occurredAt ? new Date(row.occurredAt).toLocaleDateString() : '—'),
  },
  {
    id: 'type',
    label: 'Type',
    type: 'text',
    getValue: (row) => row.typeLabel || '',
    format: (row) => row.typeLabel || '—',
  },
  {
    id: 'cobrade',
    label: 'COBRADE',
    type: 'text',
    getValue: (row) => row.cobrade || '',
    format: (row) => row.cobrade || '—',
    className: 'font-mono text-xs',
  },
  {
    id: 'recognition',
    label: 'Recognition',
    type: 'text',
    getValue: (row) => row.recognition || 'none',
    format: (row) => row.recognition || 'none',
    className: 'capitalize',
  },
];

function IndicatorTable({ rows, tableId }: { rows: GeoIndicatorRecord[]; tableId: string }) {
  return (
    <SortableDetailTable
      rows={rows}
      columns={INDICATOR_COLUMNS}
      rowKey={(row) => row._id}
      empty="No rows synced for this source yet. Open Geography management and sync it (Force if a previous sync skipped municipalities)."
      defaultSort="year"
      defaultOrder="desc"
      tableId={tableId}
    />
  );
}

export default function GeoIndicatorPanels({
  kind,
  id,
}: {
  kind: 'county' | 'state' | 'region';
  id: string;
}) {
  const panels = useMemo(() => SOURCE_PANELS.filter((panel) => panel.kinds.includes(kind)), [kind]);
  const [bySource, setBySource] = useState<Record<string, GeoIndicatorRecord[]>>({});
  const [disasters, setDisasters] = useState<GeoDisasterRecord[]>([]);
  const [amendments, setAmendments] = useState<GeoAmendmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const indicatorResults = await Promise.all(
          panels.map((panel) => {
            const params = new URLSearchParams({
              kind,
              id,
              source: panel.source,
              limit: '500',
              sort: 'year',
              order: 'desc',
            });
            return apiGet<PaginatedList<GeoIndicatorRecord>>(`/geo/indicators?${params}`);
          })
        );
        const disasterResult =
          kind === 'county'
            ? await apiGet<PaginatedList<GeoDisasterRecord>>(
                `/geo/disasters?countyId=${encodeURIComponent(id)}&limit=25`
              )
            : null;
        const amendmentParams = new URLSearchParams({
          kind,
          id,
          limit: '100',
          sort: 'year',
          order: 'desc',
        });
        const amendmentResult = await apiGet<PaginatedList<GeoAmendmentRecord>>(
          `/geo/amendments?${amendmentParams}`
        );
        if (cancelled) return;
        const next: Record<string, GeoIndicatorRecord[]> = {};
        panels.forEach((panel, index) => {
          next[panel.source] = indicatorResults[index]?.items || [];
        });
        setBySource(next);
        setDisasters(disasterResult?.items || []);
        setAmendments(amendmentResult?.items || []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load indicators.');
          setBySource({});
          setDisasters([]);
          setAmendments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, id, panels]);

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading economic indicators…</p>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {panels.map((panel) => (
        <section
          key={panel.source}
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        >
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="font-semibold">{panel.title}</h2>
          </div>
          <IndicatorTable rows={bySource[panel.source] || []} tableId={`geo-indicators-${panel.source}`} />
        </section>
      ))}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-semibold">Parliamentary amendments (records)</h2>
        </div>
        <SortableDetailTable
          rows={amendments}
          columns={AMENDMENT_COLUMNS}
          rowKey={(row) => row._id}
          empty="No amendment records yet. Open Geography management and sync Parliamentary amendments."
          defaultSort="year"
          defaultOrder="desc"
          tableId="geo-amendments"
        />
      </section>

      {kind === 'county' ? (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="font-semibold">Recent disasters</h2>
          </div>
          {disasters.length === 0 ? (
            <p className="p-4 text-sm text-[var(--muted)]">
              No disaster events yet. Sync MUNIC (survey flags) and/or S2ID (federal records) from Geography
              management.
            </p>
          ) : (
            <SortableDetailTable
              rows={disasters}
              columns={DISASTER_COLUMNS}
              rowKey={(row) => row._id}
              empty="No disaster events yet. Sync MUNIC (survey flags) and/or S2ID (federal records) from Geography management."
              defaultSort="date"
              defaultOrder="desc"
              tableId="geo-disasters"
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
