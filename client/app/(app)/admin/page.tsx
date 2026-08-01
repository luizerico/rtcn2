import Link from 'next/link';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

const adminSections = [
  {
    href: '/admin/users',
    title: 'User management',
    description: 'List accounts, create users, and keep membership identity data current.',
  },
  {
    href: '/admin/groups',
    title: 'Group management',
    description: 'Create groups and attach members for shared access roles.',
  },
  {
    href: '/admin/permissions',
    title: 'Permission management',
    description: 'Define READ, WRITE, and DELETE scopes for each group and target.',
  },
  {
    href: '/admin/sessions',
    title: 'Session management',
    description: 'Review connected users and disconnect sessions stored in the shared auth database.',
  },
  {
    href: '/surveys',
    title: 'Surveys',
    description: 'Create Survey assets with questions and visualize SurveyResponse answers.',
  },
];

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 border-b border-[var(--border)] pb-6">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Admin' }]} />
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Administration</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Choose a management area. Each section is available from the sidebar while you are in Admin.
        </p>
      </header>

      <div className="grid gap-4">
        {adminSections.map((section) => (
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
    </div>
  );
}
