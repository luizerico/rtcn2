"use client";

import { Suspense } from 'react';
import GeoCatalogList from '@/components/geo/GeoCatalogList';

function StatesList() {
  return (
    <GeoCatalogList
      title="States"
      description="Brazilian states (UF) and their parent region. Filtering runs on the API."
      noun="states"
      endpoint="/states"
      tableId="admin-geo-states"
      detailBase="/admin/geography/states"
      showRegion
      showRegionFilter
      countiesHref={(row) => `/admin/geography/counties?stateId=${row._id}`}
    />
  );
}

export default function StatesPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading states…</p>}>
      <StatesList />
    </Suspense>
  );
}
