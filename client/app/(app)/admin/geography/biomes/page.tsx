"use client";

import { Suspense } from 'react';
import GeoCatalogList from '@/components/geo/GeoCatalogList';

function BiomesList() {
  return (
    <GeoCatalogList
      title="Biomes"
      description="IBGE biomes. Filtering runs on the API."
      noun="biomes"
      endpoint="/biomes"
      tableId="admin-geo-biomes"
      detailBase="/admin/geography/biomes"
      countiesHref={(row) => `/admin/geography/counties?biomeId=${row._id}`}
    />
  );
}

export default function BiomesPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading biomes…</p>}>
      <BiomesList />
    </Suspense>
  );
}
