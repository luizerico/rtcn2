import './globals.css';
import { cookies } from 'next/headers';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ToastProvider';
import AuthGate from '@/components/AuthGate';
import { UI_PREFS_COOKIE, parseUiPreferences } from '@/lib/uiPreferences';

export const metadata = {
  title: 'RBAC Platform',
  description: 'Role-Based Access Control Management System',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const preferences = parseUiPreferences(cookieStore.get(UI_PREFS_COOKIE)?.value);
  const theme = preferences.theme;

  return (
    <html lang="en" data-theme={theme} style={{ colorScheme: theme }} suppressHydrationWarning>
      <body>
        <ThemeProvider initialPreferences={preferences}>
          <ToastProvider>
            <AuthGate>{children}</AuthGate>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
