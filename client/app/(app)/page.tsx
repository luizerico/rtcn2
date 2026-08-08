import Link from 'next/link';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

const menuItems = [
  {
    href: '/admin',
    title: 'Admin',
    description: 'Manage users, groups, and access policies from one place.',
  },
  {
    href: '/admin/users',
    title: 'Users',
    description: 'Create and review user accounts.',
  },
  {
    href: '/admin/groups',
    title: 'Groups',
    description: 'Organize members into role groups.',
  },
  {
    href: '/admin/permissions',
    title: 'Permissions',
    description: 'Assign READ, WRITE, and DELETE scopes to groups.',
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs items={[{ label: 'Home' }]} />
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[var(--foreground)]">
          LEMA Common Services
        </h1>
        <p className="mt-3 max-w-2xl text-base text-[var(--muted)]">
          Use the menu to administer identities and policies. Start with Admin, then drill into users,
          groups, or permissions.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Main menu</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition hover:border-teal-700 hover:shadow-md"
            >
              <h3 className="text-xl font-semibold text-[var(--foreground)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
