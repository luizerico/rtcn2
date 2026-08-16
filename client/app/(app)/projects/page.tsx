"use client";

import FundingCatalogList from '@/components/funding/FundingCatalogList';
import { enumLabel, ownerName, refName, type ProjectRecord } from '@/lib/fundingTypes';

export default function ProjectsPage() {
  return (
    <FundingCatalogList<ProjectRecord>
      title="Projects"
      description="Track projects, optionally linked to an opportunity and a geography record."
      noun="Project"
      endpoint="/projects"
      createHref="/projects/new"
      detailBase="/projects"
      tableId="projects"
      permissionKind="PROJECT"
      columns={[
        {
          id: 'name',
          label: 'Name',
          alwaysVisible: true,
          sortable: true,
          render: (row) => (
            <div>
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-[var(--muted)]">{refName(row.opportunity) || '—'}</div>
            </div>
          ),
        },
        {
          id: 'projStatus',
          label: 'Status',
          sortable: true,
          render: (row) => enumLabel(row.projStatus || ''),
        },
        {
          id: 'projStartDate',
          label: 'Start',
          sortable: true,
          render: (row) =>
            row.projStartDate ? new Date(row.projStartDate).toLocaleDateString() : '—',
        },
        {
          id: 'projBudget',
          label: 'Budget',
          sortable: true,
          render: (row) =>
            row.projBudget == null
              ? '—'
              : `${row.currency || ''} ${Number(row.projBudget).toLocaleString()}`,
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
