"use client";

import { Suspense } from 'react';
import GeoCatalogList from '@/components/geo/GeoCatalogList';

function RegionsList() {
  return (
    <GeoCatalogList
      title="Regions"
      description="IBGE macro-regions. Filtering runs on the API."
      noun="regions"
      endpoint="/regions"
      tableId="admin-geo-regions"
      detailBase="/admin/geography/regions"
    />
  );
}

export default function RegionsPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading regions…</p>}>
      <RegionsList />
    </Suspense>
  );
}
