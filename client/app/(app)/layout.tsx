import AppNav from '@/components/AppNav';

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <AppNav />
      <main className="min-h-screen px-4 py-6 pt-20 md:ml-64 md:px-8 md:py-8 md:pt-8">
        {children}
      </main>
    </div>
  );
}
