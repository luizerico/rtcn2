"use client";

import GeoDetail from '@/components/geo/GeoDetail';

export default function BiomeDetailPage() {
  return (
    <GeoDetail
      title="Biome"
      endpoint="/biomes"
      listHref="/admin/geography/biomes"
      listLabel="Biomes"
      childLinks={(record) => [
        { label: 'Counties in this biome', href: `/admin/geography/counties?biomeId=${record._id}` },
      ]}
    />
  );
}
