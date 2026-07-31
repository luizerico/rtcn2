"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  { href: '/', label: 'Home' },
  { href: '/admin', label: 'Admin' },
  { href: '/admin/users', label: 'Users', indent: true },
  { href: '/admin/groups', label: 'Groups', indent: true },
  { href: '/admin/permissions', label: 'Permissions', indent: true },
];

function NavLink({ href, label, indent }: { href: string; label: string; indent?: boolean }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`block rounded-md py-2 text-sm transition ${indent ? 'ml-3 px-3' : 'px-3'} ${
        active ? 'bg-teal-800 text-white' : 'text-teal-50/85 hover:bg-teal-900 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

export default function AppNav() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userUsername');
    router.push('/login');
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-[var(--sidebar)] px-4 py-6 text-[var(--sidebar-text)]">
      <div className="mb-8 px-2">
        <p className="text-xs uppercase tracking-[0.2em] text-teal-200/70">RBAC Platform</p>
        <h1 className="mt-1 text-xl font-semibold text-white">Control Center</h1>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {links.map((link) => (
          <NavLink key={link.href} {...link} />
        ))}
      </nav>

      <div className="mt-auto space-y-2 border-t border-teal-900/80 pt-4">
        <Link href="/login" className="block rounded-md px-3 py-2 text-sm text-teal-50/85 hover:bg-teal-900">
          Login
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-teal-50/85 hover:bg-red-800"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
