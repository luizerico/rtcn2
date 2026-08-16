"use client";

import GeoDetail from '@/components/geo/GeoDetail';

export default function MicroregionDetailPage() {
  return (
    <GeoDetail
      title="Microregion"
      endpoint="/microregions"
      listHref="/admin/geography/microregions"
      listLabel="Microregions"
      showRegion
      showState
      childLinks={(record) => [
        {
          label: 'Counties in this microregion',
          href: `/admin/geography/counties?microregionId=${record._id}`,
        },
      ]}
    />
  );
}
