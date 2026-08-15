"use client";

import GeoDetail from '@/components/geo/GeoDetail';

export default function RegionDetailPage() {
  return (
    <GeoDetail
      title="Region"
      endpoint="/regions"
      listHref="/admin/geography/regions"
      listLabel="Regions"
      childLinks={(record) => [
        { label: 'States in this region', href: `/admin/geography/states?regionId=${record._id}` },
        {
          label: 'Microregions in this region',
          href: `/admin/geography/microregions?regionId=${record._id}`,
        },
        { label: 'Counties in this region', href: `/admin/geography/counties?regionId=${record._id}` },
      ]}
    />
  );
}
