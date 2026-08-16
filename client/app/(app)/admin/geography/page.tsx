"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/apiUtils';
import { useAccess } from '@/components/AccessProvider';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';
import GeoManagementModal from '@/components/geo/GeoManagementModal';
import { type PaginatedList } from '@/lib/listTypes';

const sections = [
  {
    href: '/admin/geography/regions',
    endpoint: '/regions',
    title: 'Regions',
    description: 'IBGE macro-regions (Norte, Nordeste, Sudeste, Sul, Centro-Oeste).',
  },
  {
    href: '/admin/geography/states',
    endpoint: '/states',
    title: 'States',
    description: 'Brazilian states (UF) and their parent region.',
  },
  {
    href: '/admin/geography/microregions',
    endpoint: '/microregions',
    title: 'Microregions',
    description: 'IBGE microregions linked to a state and region.',
  },
  {
    href: '/admin/geography/biomes',
    endpoint: '/biomes',
    title: 'Biomes',
    description: 'Brazilian biomes (Amazônia, Cerrado, Caatinga, Mata Atlântica, Pampa, Pantanal).',
  },
  {
    href: '/admin/geography/counties',
    endpoint: '/counties',
    title: 'Counties',
    description: 'Municipalities with status series and paginated emissions.',
  },
] as const;

function formatTotal(total: number | null | undefined, loading: boolean): string {
  if (loading) return '…';
  if (total == null) return '—';
  return total.toLocaleString();
}

export default function GeographyHubPage() {
  const { isAdmin } = useAccess();
  const [totals, setTotals] = useState<Partial<Record<(typeof sections)[number]['endpoint'], number | null>>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const entries = await Promise.all(
        sections.map(async (section) => {
          try {
            const result = await apiGet<PaginatedList<unknown>>(`${section.endpoint}?page=1&limit=1`);
            return [section.endpoint, result.pagination?.total ?? 0] as const;
          } catch {
            return [section.endpoint, null] as const;
          }
        })
      );
      if (!cancelled) {
        setTotals(Object.fromEntries(entries));
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Geography' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Geography</h1>
            <p className="mt-2 max-w-2xl text-[var(--muted)]">
              Read-only IBGE catalog. Import sample data with <code>npm run db:seed-geo</code>.
            </p>
          </div>
          {isAdmin ? (
            <AccessPrimaryButton
              allowed={isAdmin}
              aria-expanded={manageOpen}
              aria-haspopup="dialog"
              onClick={() => setManageOpen((open) => !open)}
            >
              {manageOpen ? 'Hide Data Sync' : 'Data Sync'}
            </AccessPrimaryButton>
          ) : null}
        </div>
      </header>

      {isAdmin ? (
        <GeoManagementModal isOpen={manageOpen} onClose={() => setManageOpen(false)} />
      ) : null}

      <div className="grid gap-4">
        {sections.map((section) => {
          const total = totals[section.endpoint];
          return (
            <Link
              key={section.href}
              href={section.href}
              className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-teal-700"
            >
              <div>
                <h2 className="text-xl font-semibold">{section.title}</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">{section.description}</p>
              </div>
              <div className="mt-1 shrink-0 text-right">
                <p className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">
                  {formatTotal(total, loading)}
                </p>
                <p className="text-xs text-[var(--muted)]">{total === 1 ? 'record' : 'records'}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
