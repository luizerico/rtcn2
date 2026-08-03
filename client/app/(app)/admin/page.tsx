"use client";

import { useMemo } from 'react';
import Link from 'next/link';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { useAccess } from '@/components/AccessProvider';

const adminSections = [
  {
    href: '/admin/users',
    title: 'User management',
    description: 'List accounts, create users, and keep membership identity data current.',
    visible: (_can: ReturnType<typeof useAccess>['can'], isAdmin: boolean) => isAdmin,
  },
  {
    href: '/admin/groups',
    title: 'Group management',
    description: 'Create groups and attach members for shared access roles.',
    visible: (_can: ReturnType<typeof useAccess>['can'], isAdmin: boolean) => isAdmin,
  },
  {
    href: '/admin/permissions',
    title: 'Permission management',
    description: 'Define READ, WRITE, and DELETE scopes for each group and target.',
    visible: (_can: ReturnType<typeof useAccess>['can'], isAdmin: boolean) => isAdmin,
  },
  {
    href: '/admin/sessions',
    title: 'Session management',
    description: 'Review connected users and disconnect sessions stored in the shared auth database.',
    visible: () => true,
  },
  {
    href: '/admin/logs',
    title: 'Action logs',
    description: 'Search and filter user actions recorded in the database for audit and troubleshooting.',
    visible: (_can: ReturnType<typeof useAccess>['can'], isAdmin: boolean) => isAdmin,
  },
  {
    href: '/admin/reports',
    title: 'Reports sample',
    description: 'Exercise the FastAPI GraphQL reports service with live platform analytics.',
    visible: (_can: ReturnType<typeof useAccess>['can'], isAdmin: boolean) => isAdmin,
  },
  {
    href: '/surveys',
    title: 'Surveys',
    description: 'Create Survey assets with questions and visualize SurveyResponse answers.',
    visible: (can: ReturnType<typeof useAccess>['can']) =>
      can('SURVEY:READ', { allowAnyInstance: true }),
  },
];

export default function AdminPage() {
  const { can, isAdmin } = useAccess();
  const sections = useMemo(
    () => adminSections.filter((section) => section.visible(can, isAdmin)),
    [can, isAdmin]
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 border-b border-[var(--border)] pb-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Admin' }]} />
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Administration</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Choose a management area. Each section is available from the sidebar while you are in Admin.
        </p>
      </header>

      {sections.length === 0 ? (
        <p className="text-[var(--muted)]">You do not have access to any admin sections.</p>
      ) : (
        <div className="grid gap-4">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-teal-700"
            >
              <div>
                <h2 className="text-xl font-semibold">{section.title}</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">{section.description}</p>
              </div>
              <span className="mt-1 text-sm font-medium text-[var(--accent)]">Open</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
