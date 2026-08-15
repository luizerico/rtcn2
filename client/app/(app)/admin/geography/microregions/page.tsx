"use client";

import { Suspense } from 'react';
import GeoCatalogList from '@/components/geo/GeoCatalogList';

function MicroregionsList() {
  return (
    <GeoCatalogList
      title="Microregions"
      description="IBGE microregions linked to a state and region. Filtering runs on the API."
      noun="microregions"
      endpoint="/microregions"
      tableId="admin-geo-microregions"
      detailBase="/admin/geography/microregions"
      showRegion
      showState
      showRegionFilter
      showStateFilter
    />
  );
}

export default function MicroregionsPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading microregions…</p>}>
      <MicroregionsList />
    </Suspense>
  );
}
