"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import AppNav from '@/components/AppNav';
import { useTheme } from '@/components/ThemeProvider';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { preferences, setPreferences } = useTheme();
  const collapsed = Boolean(preferences.navCollapsed);
  const pathname = usePathname();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('nav') !== 'minimized') return;
    setPreferences({ navCollapsed: true });
    params.delete('nav');
    const query = params.toString();
    window.history.replaceState({}, '', query ? `${pathname}?${query}` : pathname);
  }, [pathname, setPreferences]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <AppNav />
      <main
        className={`min-h-screen px-4 py-6 pt-20 transition-[margin] duration-200 ease-out md:px-8 md:py-8 md:pt-8 ${
          collapsed ? 'md:ml-14' : 'md:ml-64'
        }`}
      >
        {children}
      </main>
    </div>
  );
}
