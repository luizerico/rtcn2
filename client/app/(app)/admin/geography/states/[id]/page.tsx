"use client";

import GeoDetail from '@/components/geo/GeoDetail';

export default function StateDetailPage() {
  return (
    <GeoDetail
      title="State"
      endpoint="/states"
      listHref="/admin/geography/states"
      listLabel="States"
      showRegion
      mapKind="state"
      indicatorKind="state"
      childLinks={(record) => [
        {
          label: 'Microregions in this state',
          href: `/admin/geography/microregions?stateId=${record._id}`,
        },
        { label: 'Counties in this state', href: `/admin/geography/counties?stateId=${record._id}` },
      ]}
    />
  );
}
