import AppNav from '@/components/AppNav';

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <AppNav />
      <main className="ml-64 min-h-screen px-8 py-8">{children}</main>
    </div>
  );
}
