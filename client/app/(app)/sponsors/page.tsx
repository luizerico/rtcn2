"use client";

import FundingCatalogList from '@/components/funding/FundingCatalogList';
import { enumLabel, ownerName, type SponsorRecord } from '@/lib/fundingTypes';

export default function SponsorsPage() {
  return (
    <FundingCatalogList<SponsorRecord>
      title="Sponsors"
      description="Browse and manage funding sponsors. Create records from the table toolbar."
      noun="Sponsor"
      endpoint="/sponsors"
      createHref="/sponsors/new"
      detailBase="/sponsors"
      tableId="sponsors"
      permissionKind="SPONSOR"
      columns={[
        {
          id: 'name',
          label: 'Name',
          alwaysVisible: true,
          sortable: true,
          render: (row) => (
            <div>
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-[var(--muted)]">{row.orgEmail}</div>
            </div>
          ),
        },
        {
          id: 'origem',
          label: 'Origin',
          sortable: true,
          render: (row) => enumLabel(row.origem || ''),
        },
        {
          id: 'contact',
          label: 'Contact',
          render: (row) => row.contact || '—',
        },
        {
          id: 'updatedAt',
          label: 'Updated',
          sortable: true,
          className: 'hidden lg:table-cell',
          render: (row) => (row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'),
        },
        {
          id: 'owner',
          label: 'Owner',
          render: (row) => ownerName(row.ownerId),
        },
      ]}
    />
  );
}
