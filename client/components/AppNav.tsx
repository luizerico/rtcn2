"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import { useAccess } from '@/components/AccessProvider';
import { useTheme } from '@/components/ThemeProvider';
import { clearAccessCache } from '@/lib/accessCache';

type NavItem = {
  href: string;
  label: string;
  indent?: boolean;
  /** Return true when the link should be shown. */
  visible: (can: ReturnType<typeof useAccess>['can'], isAdmin: boolean) => boolean;
};

type NavIconName =
  | 'home'
  | 'surveys'
  | 'sponsors'
  | 'opportunities'
  | 'projects'
  | 'admin'
  | 'users'
  | 'groups'
  | 'organizations'
  | 'permissions'
  | 'sessions'
  | 'logs'
  | 'bin'
  | 'reports'
  | 'geography'
  | 'localplans'
  | 'profile'
  | 'switchAccount'
  | 'logout';

const NAV_ICON_BY_HREF: Record<string, NavIconName> = {
  '/': 'home',
  '/surveys': 'surveys',
  '/localplans': 'localplans',
  '/admin/surveys': 'surveys',
  '/sponsors': 'sponsors',
  '/opportunities': 'opportunities',
  '/projects': 'projects',
  '/admin': 'admin',
  '/admin/users': 'users',
  '/admin/groups': 'groups',
  '/admin/organizations': 'organizations',
  '/admin/permissions': 'permissions',
  '/admin/sessions': 'sessions',
  '/admin/logs': 'logs',
  '/admin/bin': 'bin',
  '/admin/reports': 'reports',
  '/admin/geography': 'geography',
  '/account': 'profile',
  '/login': 'switchAccount',
};

function NavIcon({ name, className = 'h-5 w-5' }: { name: NavIconName; className?: string }) {
  const common = {
    className,
    fill: 'none' as const,
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    'aria-hidden': true as const,
  };
  const stroke = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.75 };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path {...stroke} d="M3 10.5 12 3l9 7.5" />
          <path {...stroke} d="M5 9.5V20h14V9.5" />
        </svg>
      );
    case 'surveys':
      return (
        <svg {...common}>
          <path {...stroke} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path {...stroke} d="M14 2v6h6" />
          <path {...stroke} d="M8 13h8M8 17h5" />
        </svg>
      );
    case 'localplans':
      return (
        <svg {...common}>
          <path {...stroke} d="M4 6h16v12H4z" />
          <path {...stroke} d="M8 6V4h8v2" />
          <path {...stroke} d="M8 10h8M8 14h5" />
        </svg>
      );
    case 'sponsors':
      return (
        <svg {...common}>
          <path {...stroke} d="M3 21h18" />
          <path {...stroke} d="M5 21V8l7-5 7 5v13" />
          <path {...stroke} d="M9 21v-6h6v6" />
        </svg>
      );
    case 'opportunities':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path {...stroke} d="M12 8v8M8 12h8" />
        </svg>
      );
    case 'projects':
      return (
        <svg {...common}>
          <path {...stroke} d="M4 7h16v12H4z" />
          <path {...stroke} d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case 'admin':
      return (
        <svg {...common}>
          <path {...stroke} d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <path {...stroke} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" {...stroke} />
          <path {...stroke} d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'groups':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" {...stroke} />
          <circle cx="16.5" cy="9.5" r="2.5" {...stroke} />
          <path {...stroke} d="M2.5 19.5a6 6 0 0 1 12 0" />
          <path {...stroke} d="M14 19.5a4.5 4.5 0 0 1 7.5 0" />
        </svg>
      );
    case 'organizations':
      return (
        <svg {...common}>
          <path {...stroke} d="M4 21V7l6-3 6 3v14" />
          <path {...stroke} d="M10 21V11h4v10" />
          <path {...stroke} d="M16 10h4v11H4" />
        </svg>
      );
    case 'permissions':
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="10" rx="2" {...stroke} />
          <path {...stroke} d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case 'sessions':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="14" rx="2" {...stroke} />
          <path {...stroke} d="M8 22h8M12 18v4" />
        </svg>
      );
    case 'logs':
      return (
        <svg {...common}>
          <path {...stroke} d="M8 6h13M8 12h13M8 18h13" />
          <path {...stroke} d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case 'bin':
      return (
        <svg {...common}>
          <path {...stroke} d="M4 7h16" />
          <path {...stroke} d="M10 11v6M14 11v6" />
          <path {...stroke} d="M6 7l1 13h10l1-13" />
          <path {...stroke} d="M9 7V4h6v3" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...common}>
          <path {...stroke} d="M4 19V5" />
          <path {...stroke} d="M4 19h16" />
          <path {...stroke} d="M8 17V10" />
          <path {...stroke} d="M12 17V7" />
          <path {...stroke} d="M16 17v-4" />
        </svg>
      );
    case 'geography':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path {...stroke} d="M3 12h18" />
          <path {...stroke} d="M12 3a14 14 0 0 1 0 18" />
          <path {...stroke} d="M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...common}>
          <path {...stroke} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" {...stroke} />
        </svg>
      );
    case 'switchAccount':
      return (
        <svg {...common}>
          <path {...stroke} d="M16 3h5v5" />
          <path {...stroke} d="M21 3l-7 7" />
          <path {...stroke} d="M8 21H3v-5" />
          <path {...stroke} d="M3 21l7-7" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...common}>
          <path {...stroke} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path {...stroke} d="M16 17l5-5-5-5" />
          <path {...stroke} d="M21 12H9" />
        </svg>
      );
    default:
      return null;
  }
}

const links: NavItem[] = [
  { href: '/', label: 'Home', visible: () => true },
  {
    href: '/surveys',
    label: 'Surveys',
    visible: (can) =>
      can('SURVEY:READ', { allowAnyInstance: true }) ||
      can('COUNTY:READ', { allowAnyInstance: true }),
  },
  {
    href: '/localplans',
    label: 'Local plans',
    visible: (can) =>
      can('LOCALPLAN:READ', { allowAnyInstance: true }) ||
      can('COUNTY:READ', { allowAnyInstance: true }),
  },
  {
    href: '/sponsors',
    label: 'Sponsors',
    visible: (can) => can('SPONSOR:READ', { allowAnyInstance: true }),
  },
  {
    href: '/opportunities',
    label: 'Opportunities',
    visible: (can) => can('OPPORTUNITY:READ', { allowAnyInstance: true }),
  },
  {
    href: '/projects',
    label: 'Projects',
    visible: (can) => can('PROJECT:READ', { allowAnyInstance: true }),
  },
  {
    href: '/admin',
    label: 'Admin',
    visible: (can, isAdmin) =>
      isAdmin ||
      can('SURVEY:READ', { allowAnyInstance: true }) ||
      can('LOCALPLAN:READ', { allowAnyInstance: true }) ||
      can('SPONSOR:READ', { allowAnyInstance: true }) ||
      can('OPPORTUNITY:READ', { allowAnyInstance: true }) ||
      can('PROJECT:READ', { allowAnyInstance: true }) ||
      can('USER:READ') ||
      can('GROUP:READ') ||
      can('ORGANIZATION:READ') ||
      can('LOG:READ'),
  },
  {
    href: '/admin/surveys',
    label: 'Surveys',
    indent: true,
    visible: (can) => can('SURVEY:READ', { allowAnyInstance: true }),
  },
  { href: '/admin/users', label: 'Users', indent: true, visible: (_c, isAdmin) => isAdmin },
  { href: '/admin/groups', label: 'Groups', indent: true, visible: (_c, isAdmin) => isAdmin },
  {
    href: '/admin/organizations',
    label: 'Organizations',
    indent: true,
    visible: (_c, isAdmin) => isAdmin,
  },
  {
    href: '/admin/permissions',
    label: 'Permissions',
    indent: true,
    visible: (_c, isAdmin) => isAdmin,
  },
  {
    href: '/admin/sessions',
    label: 'Sessions',
    indent: true,
    // Any signed-in user can list/disconnect their own sessions.
    visible: () => true,
  },
  { href: '/admin/logs', label: 'Logs', indent: true, visible: (_c, isAdmin) => isAdmin },
  { href: '/admin/bin', label: 'Recycle bin', indent: true, visible: (_c, isAdmin) => isAdmin },
  {
    href: '/admin/reports',
    label: 'Reports',
    indent: true,
    visible: (_c, isAdmin) => isAdmin,
  },
  {
    href: '/admin/geography',
    label: 'Geography',
    indent: true,
    visible: (_c, isAdmin) => isAdmin,
  },
];

function BurgerIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function NavLink({
  href,
  label,
  indent,
  onNavigate,
  collapsed,
}: {
  href: string;
  label: string;
  indent?: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const icon = NAV_ICON_BY_HREF[href] || 'home';
  const activeClass = active
    ? 'bg-teal-800 text-white'
    : 'text-teal-50/85 hover:bg-teal-900 hover:text-white';

  if (collapsed) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        title={label}
        aria-label={label}
        className={`flex h-10 w-10 items-center justify-center rounded-md transition ${activeClass}`}
      >
        <NavIcon name={icon} />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-md py-2 text-sm transition ${
        indent ? 'ml-3 px-3' : 'px-3'
      } ${activeClass}`}
    >
      <NavIcon name={icon} className="h-4 w-4 shrink-0 opacity-90" />
      <span>{label}</span>
    </Link>
  );
}

function SidebarBody({
  username,
  isAdmin,
  onLogout,
  onNavigate,
  visibleLinks,
  collapsed,
}: {
  username: string | null;
  isAdmin: boolean;
  onLogout: () => void;
  onNavigate?: () => void;
  visibleLinks: NavItem[];
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        <nav className="flex flex-1 flex-col items-center gap-1">
          {visibleLinks.map((link) => (
            <NavLink key={link.href} {...link} collapsed onNavigate={onNavigate} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1 border-t border-teal-900/80 pt-3">
          <NavLink href="/account" label="Profile" collapsed onNavigate={onNavigate} />
          {isAdmin ? (
            <Link
              href="/login"
              onClick={onNavigate}
              title="Switch account"
              aria-label="Switch account"
              className="flex h-10 w-10 items-center justify-center rounded-md text-teal-50/85 hover:bg-teal-900"
            >
              <NavIcon name="switchAccount" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            title="Logout"
            aria-label="Logout"
            className="flex h-10 w-10 items-center justify-center rounded-md text-teal-50/85 hover:bg-red-800"
          >
            <NavIcon name="logout" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 px-2">
        <p className="text-xs uppercase tracking-[0.2em] text-teal-200/70">LEMA Platform</p>
        <h1 className="mt-1 text-xl font-semibold text-white">Common Services</h1>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {visibleLinks.map((link) => (
          <NavLink key={link.href} {...link} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto space-y-2 border-t border-teal-900/80 pt-4">
        {username && (
          <p className="px-3 text-xs text-teal-100/80">
            Signed in as <span className="font-semibold text-white">{username}</span>
          </p>
        )}
        <NavLink href="/account" label="Profile" onNavigate={onNavigate} />
        {isAdmin ? (
          <Link
            href="/login"
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-teal-50/85 hover:bg-teal-900"
          >
            <NavIcon name="switchAccount" className="h-4 w-4 shrink-0 opacity-90" />
            <span>Switch account</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-teal-50/85 hover:bg-red-800"
        >
          <NavIcon name="logout" className="h-4 w-4 shrink-0 opacity-90" />
          <span>Logout</span>
        </button>
      </div>
    </>
  );
}

export default function AppNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { pushToast } = useToast();
  const { can, isAdmin, user, clear } = useAccess();
  const { preferences, setPreferences } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const username = user?.username || null;
  const navCollapsed = Boolean(preferences.navCollapsed);

  const visibleLinks = useMemo(
    () => links.filter((link) => link.visible(can, isAdmin)),
    [can, isAdmin]
  );

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

  const toggleNavCollapsed = () => {
    setPreferences({ navCollapsed: !navCollapsed });
  };

  const handleLogout = async () => {
    try {
      await apiPost('/auth/logout', {});
    } catch {
      // Still clear local session even if API logout fails.
    }
    clearAccessCache();
    clear();
    localStorage.removeItem('authToken');
    localStorage.removeItem('userUsername');
    localStorage.removeItem('sessionId');
    // Cookie cleared by /auth/logout Set-Cookie.
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
          <BurgerIcon />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-white">Common Services</p>
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
              isAdmin={isAdmin}
              onLogout={handleLogout}
              onNavigate={() => setMobileOpen(false)}
              visibleLinks={visibleLinks}
            />
          </aside>
        </div>
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-[var(--sidebar)] py-4 text-[var(--sidebar-text)] transition-[width,padding] duration-200 ease-out md:flex ${
          navCollapsed ? 'w-14 items-center px-2' : 'w-64 px-4'
        }`}
      >
        <div
          className={`mb-4 flex items-center ${navCollapsed ? 'justify-center' : 'justify-between gap-2 px-1'}`}
        >
          <button
            type="button"
            onClick={toggleNavCollapsed}
            className="rounded-md p-2 text-teal-50/90 hover:bg-teal-900"
            aria-expanded={!navCollapsed}
            aria-controls="desktop-nav"
            aria-label={navCollapsed ? 'Expand navigation' : 'Minimize navigation'}
            title={navCollapsed ? 'Expand navigation' : 'Minimize navigation'}
          >
            <BurgerIcon className="h-5 w-5" />
          </button>
          {!navCollapsed ? (
            <span className="truncate text-xs font-medium uppercase tracking-wide text-teal-200/70">
              Menu
            </span>
          ) : null}
        </div>
        <div id="desktop-nav" className="flex min-h-0 flex-1 flex-col">
          <SidebarBody
            username={username}
            isAdmin={isAdmin}
            onLogout={handleLogout}
            visibleLinks={visibleLinks}
            collapsed={navCollapsed}
          />
        </div>
      </aside>
    </>
  );
}
