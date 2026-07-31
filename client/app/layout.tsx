import './globals.css';
import { ToastProvider } from '@/components/ToastProvider';
import AuthGate from '@/components/AuthGate';

export const metadata = {
  title: 'RBAC Platform',
  description: 'Role-Based Access Control Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AuthGate>{children}</AuthGate>
        </ToastProvider>
      </body>
    </html>
  );
}
