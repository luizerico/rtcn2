"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet } from '@/lib/apiUtils';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import GeoMapPanel, { type GeoMapKind } from '@/components/geo/GeoMapPanel';
import GeoIndicatorPanels from '@/components/geo/GeoIndicatorPanels';
import { geoId, geoLabel, type GeoRef } from '@/lib/geoTypes';

interface GeoDetailRecord {
  _id: string;
  code?: string;
  name: string;
  region?: GeoRef | string;
  state?: GeoRef | string;
}

interface ChildLink {
  label: string;
  href: string;
}

interface GeoDetailProps {
  title: string;
  endpoint: string;
  listHref: string;
  listLabel: string;
  showRegion?: boolean;
  showState?: boolean;
  mapKind?: GeoMapKind;
  indicatorKind?: 'county' | 'state' | 'region';
  childLinks?: (record: GeoDetailRecord) => ChildLink[];
}

export default function GeoDetail({
  title,
  endpoint,
  listHref,
  listLabel,
  showRegion = false,
  showState = false,
  mapKind,
  indicatorKind,
  childLinks,
}: GeoDetailProps) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [record, setRecord] = useState<GeoDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<GeoDetailRecord>(`${endpoint}/${id}`);
        setRecord(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to load ${title.toLowerCase()}.`);
        setRecord(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [endpoint, id, title]);

  const regionHref = geoId(record?.region);
  const stateHref = geoId(record?.state);
  const links = record && childLinks ? childLinks(record) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Geography', href: '/admin/geography' },
            { label: listLabel, href: listHref },
            { label: record?.name || title },
          ]}
        />
        <h1 className="mt-2 text-3xl font-semibold">{record?.name || title}</h1>
        <p className="mt-2 text-[var(--muted)]">Read-only geography catalog record.</p>
      </header>

      {loading ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {record ? (
        <>
          {mapKind ? <GeoMapPanel kind={mapKind} code={record.code} label={record.name} /> : null}
          <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Code</dt>
              <dd className="mt-1 font-mono text-sm">{record.code || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Name</dt>
              <dd className="mt-1 font-medium">{record.name}</dd>
            </div>
            {showRegion ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Region</dt>
                <dd className="mt-1">
                  {regionHref ? (
                    <Link
                      href={`/admin/geography/regions/${regionHref}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {geoLabel(record.region)}
                    </Link>
                  ) : (
                    geoLabel(record.region)
                  )}
                </dd>
              </div>
            ) : null}
            {showState ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">State</dt>
                <dd className="mt-1">
                  {stateHref ? (
                    <Link
                      href={`/admin/geography/states/${stateHref}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {geoLabel(record.state)}
                    </Link>
                  ) : (
                    geoLabel(record.state)
                  )}
                </dd>
              </div>
            ) : null}
          </dl>

          {links.length ? (
            <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--accent-soft)]/40"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
          {indicatorKind ? <GeoIndicatorPanels kind={indicatorKind} id={record._id} /> : null}
        </>
      ) : null}
    </div>
  );
}
