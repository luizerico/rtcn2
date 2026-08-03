"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';

const links = [
  { href: '/', label: 'Home' },
  { href: '/surveys', label: 'Surveys' },
  { href: '/admin', label: 'Admin' },
  { href: '/admin/users', label: 'Users', indent: true },
  { href: '/admin/groups', label: 'Groups', indent: true },
  { href: '/admin/permissions', label: 'Permissions', indent: true },
  { href: '/admin/sessions', label: 'Sessions', indent: true },
  { href: '/admin/logs', label: 'Logs', indent: true },
  { href: '/admin/reports', label: 'Reports', indent: true },
];

function NavLink({
  href,
  label,
  indent,
  onNavigate,
}: {
  href: string;
  label: string;
  indent?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`block rounded-md py-2 text-sm transition ${indent ? 'ml-3 px-3' : 'px-3'} ${
        active ? 'bg-teal-800 text-white' : 'text-teal-50/85 hover:bg-teal-900 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

function SidebarBody({
  username,
  onLogout,
  onNavigate,
}: {
  username: string | null;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="mb-8 px-2">
        <p className="text-xs uppercase tracking-[0.2em] text-teal-200/70">RBAC Platform</p>
        <h1 className="mt-1 text-xl font-semibold text-white">Control Center</h1>
        {username && (
          <p className="mt-2 text-xs text-teal-100/80">
            Signed in as <span className="font-semibold text-white">{username}</span>
          </p>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {links.map((link) => (
          <NavLink key={link.href} {...link} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto space-y-2 border-t border-teal-900/80 pt-4">
        <NavLink href="/account" label="Profile" onNavigate={onNavigate} />
        <Link
          href="/login"
          onClick={onNavigate}
          className="block rounded-md px-3 py-2 text-sm text-teal-50/85 hover:bg-teal-900"
        >
          Switch account
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-teal-50/85 hover:bg-red-800"
        >
          Logout
        </button>
      </div>
    </>
  );
}

export default function AppNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { pushToast } = useToast();
  const [username, setUsername] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setUsername(localStorage.getItem('userUsername'));
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    try {
      await apiPost('/auth/logout', {});
    } catch {
      // Still clear local session even if API logout fails.
    }
    localStorage.removeItem('authToken');
    localStorage.removeItem('userUsername');
    localStorage.removeItem('sessionId');
    pushToast({
      tone: 'info',
      title: 'Signed out',
      message: 'Your session was closed.',
    });
    setMobileOpen(false);
    router.push('/login?reason=REVOKED');
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--sidebar)] px-4 text-[var(--sidebar-text)] md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 hover:bg-teal-900"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          aria-label="Open navigation"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-white">Control Center</p>
        </div>
        <div className="w-10" aria-hidden="true" />
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="mobile-nav"
            className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col bg-[var(--sidebar)] px-4 py-6 text-[var(--sidebar-text)] shadow-xl"
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 hover:bg-teal-900"
                aria-label="Close navigation"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SidebarBody
              username={username}
              onLogout={handleLogout}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[var(--sidebar)] px-4 py-6 text-[var(--sidebar-text)] md:flex">
        <SidebarBody username={username} onLogout={handleLogout} />
      </aside>
    </>
  );
}
