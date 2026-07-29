// client/app/(dashboard)/layout.tsx
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* The sidebar will be fixed and take up a defined width */}
      <aside className="fixed top-0 left-0 h-full z-30 shadow-lg">{/* Sidebar component handles the content */}
        <Sidebar />
      </aside>

      {/* Main Content Area - Adjust padding to account for fixed sidebar */}
      <main className="flex-1 ml-64 p-8 pt-24"> 
        {children}
      </main>
    </div>
  );
}