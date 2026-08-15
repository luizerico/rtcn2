"use client";

import { Suspense } from 'react';
import CountyCatalogList from '@/components/geo/CountyCatalogList';

export default function CountiesPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading counties…</p>}>
      <CountyCatalogList />
    </Suspense>
  );
}
