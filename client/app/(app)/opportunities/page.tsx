"use client";

import FundingCatalogList from '@/components/funding/FundingCatalogList';
import { enumLabel, ownerName, refName, type OpportunityRecord } from '@/lib/fundingTypes';

export default function OpportunitiesPage() {
  return (
    <FundingCatalogList<OpportunityRecord>
      title="Opportunities"
      description="Browse funding calls and other opportunities linked to sponsors."
      noun="Opportunity"
      endpoint="/opportunities"
      createHref="/opportunities/new"
      detailBase="/opportunities"
      tableId="opportunities"
      permissionKind="OPPORTUNITY"
      columns={[
        {
          id: 'name',
          label: 'Name',
          alwaysVisible: true,
          sortable: true,
          render: (row) => (
            <div>
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-[var(--muted)]">{refName(row.sponsor) || '—'}</div>
            </div>
          ),
        },
        {
          id: 'category',
          label: 'Category',
          render: (row) => enumLabel(row.category || ''),
        },
        {
          id: 'startDate',
          label: 'Start',
          sortable: true,
          render: (row) => (row.startDate ? new Date(row.startDate).toLocaleDateString() : '—'),
        },
        {
          id: 'budget',
          label: 'Budget',
          sortable: true,
          render: (row) =>
            row.budget == null ? '—' : `${row.currency || ''} ${Number(row.budget).toLocaleString()}`,
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
