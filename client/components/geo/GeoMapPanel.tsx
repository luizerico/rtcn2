"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { apiGet } from '@/lib/apiUtils';
import type { GeoJsonObject } from 'geojson';

export type GeoMapKind = 'county' | 'state' | 'region';

const GeoBoundaryMap = dynamic(() => import('./GeoBoundaryMap'), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-[var(--muted)]">Loading map…</p>,
});

function MapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  );
}

export default function GeoMapPanel({
  kind,
  code,
  label,
  marker,
}: {
  kind: GeoMapKind;
  code?: string;
  label?: string;
  marker?: { lat?: number; long?: number };
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GeoJsonObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = (code || '').trim();

  useEffect(() => {
    if (!open) return;
    if (!trimmed) {
      setData(null);
      setError('No IBGE code is available for this record.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    apiGet<GeoJsonObject>(`/geo/malhas/${kind}/${encodeURIComponent(trimmed)}`)
      .then((geo) => {
        if (!cancelled) setData(geo);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Failed to load map boundary.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kind, open, trimmed]);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="font-semibold">{label ? `${label} map` : 'Map'}</h2>
        <button
          type="button"
          aria-pressed={open}
          aria-label={open ? 'Hide map' : 'Show map'}
          onClick={() => setOpen((value) => !value)}
          className="rounded-md border border-[var(--border)] p-2 text-[var(--foreground)] hover:bg-[var(--accent-soft)]/40"
        >
          <MapIcon />
        </button>
      </div>
      {open ? (
        <div className="border-t border-[var(--border)]">
          {loading ? <p className="p-4 text-sm text-[var(--muted)]">Loading boundary…</p> : null}
          {error ? (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          ) : null}
          {!loading && !error && data ? <GeoBoundaryMap data={data} marker={marker} /> : null}
        </div>
      ) : null}
    </section>
  );
}
