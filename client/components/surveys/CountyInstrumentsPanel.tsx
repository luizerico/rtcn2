"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/apiUtils';
import { useAccess } from '@/components/AccessProvider';

type SubjectInstrument = {
  instrument: {
    _id: string;
    name: string;
    instrumentType?: string;
    status?: string;
  };
  response: {
    _id: string;
    status: string;
    revision: number;
    updatedAt?: string;
    ownerId?: string | null;
    computedScore?: { letter?: string; percent?: number; total?: number };
  } | null;
};

export default function CountyInstrumentsPanel({ countyId }: { countyId: string }) {
  const { can, isAdmin, user } = useAccess();
  const canRead = can('COUNTY:READ', { resourceId: countyId });
  const canWrite = can('COUNTY:WRITE', { resourceId: countyId });
  const [items, setItems] = useState<SubjectInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<{ items: SubjectInstrument[] }>(
          `/counties/${countyId}/instruments`
        );
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load instruments.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [canRead, countyId]);

  if (!canRead) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="font-semibold">Instruments</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Current sheets for this county, with grade and revision history.
        </p>
      </div>
      {loading ? (
        <p className="p-4 text-sm text-[var(--muted)]">Loading instruments…</p>
      ) : error ? (
        <p className="p-4 text-sm text-red-700">{error}</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-[var(--muted)]">No published instruments yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((row) => {
            const href = `/surveys/${row.instrument._id}/subjects/COUNTY/${countyId}`;
            const score = row.response?.computedScore;
            const canStart =
              can('COUNTY:CREATE', { resourceId: countyId }) &&
              can('SURVEY:READ', { resourceId: row.instrument._id });
            const ownerEditable =
              Boolean(row.response) &&
              (row.response?.status === 'in_progress' || row.response?.status === 'need_changes') &&
              row.response?.ownerId === user?.id;
            const canEditExisting = Boolean(row.response) && (isAdmin || canWrite || ownerEditable);
            const label = row.response ? (canEditExisting ? 'Open sheet' : 'View') : canStart ? 'Start' : null;
            return (
              <li key={row.instrument._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{row.instrument.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {row.instrument.instrumentType === 'scored_diagnostic' ? 'Diagnostic' : 'Poll'}
                    {row.response
                      ? ` · ${row.response.status} · rev ${row.response.revision}`
                      : ' · not started'}
                    {score?.letter ? ` · ${score.letter} (${score.percent ?? 0}%)` : ''}
                  </p>
                </div>
                {label ? (
                  <Link
                    href={href}
                    className="text-sm font-medium text-[var(--accent)] hover:underline"
                  >
                    {label}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
