"use client";

import Link from 'next/link';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

const sections = [
  {
    href: '/admin/geography/regions',
    title: 'Regions',
    description: 'IBGE macro-regions (Norte, Nordeste, Sudeste, Sul, Centro-Oeste).',
  },
  {
    href: '/admin/geography/states',
    title: 'States',
    description: 'Brazilian states (UF) and their parent region.',
  },
  {
    href: '/admin/geography/microregions',
    title: 'Microregions',
    description: 'IBGE microregions linked to a state and region.',
  },
  {
    href: '/admin/geography/biomes',
    title: 'Biomes',
    description: 'Brazilian biomes (Amazônia, Cerrado, Caatinga, Mata Atlântica, Pampa, Pantanal).',
  },
  {
    href: '/admin/geography/counties',
    title: 'Counties',
    description: 'Municipalities with status series and paginated emissions.',
  },
];

export default function GeographyHubPage() {
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
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Geography</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Read-only IBGE catalog. Import sample data with <code>npm run db:seed-geo</code>.
        </p>
      </header>

      <div className="grid gap-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-teal-700"
          >
            <div>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">{section.description}</p>
            </div>
            <span className="mt-1 text-sm font-medium text-[var(--accent)]">Open</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
