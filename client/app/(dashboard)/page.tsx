import Link from 'next/link';
import { apiGet } from '@/lib/apiUtils';
import { useEffect, useState } from 'react';

// Mock structure for a Dashboard Widget
interface WidgetData {
  title: string;
  value: string | number;
  description: string;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<WidgetData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        // 1. Fetching summary data (e.g., count of groups, objects)
        // Note: We use a generic GET call here. The actual API needs to handle this endpoint /groups/stats or similar.
        const initialGroups = await apiGet('/groups'); // Assuming this returns group list/count
        
        setWidgets([
            {
                title: 'Total Groups',
                value: initialGroups.length > 0 ? initialGroups.length.toString() : '0',
                description: 'Number of distinct groups defined in the system.',
            },
            // Placeholder for total users, etc.
            {
                title: 'Protected Objects',
                value: '12', // Mocked count until object controller is fully integrated
                description: 'Total resources needing access control policies.',
            },
             {
                title: 'Pending Permissions Review',
                value: '3', // Mocked alert status
                description: 'Groups requiring administrator review of assigned permissions.',
            }
        ]);

      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        setError('Could not load summary statistics. Please check API connection or admin rights.');
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  const DashboardCard: React.FC<{ title: string; value: string | number; description: string }> = ({ title, value, description }) => (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 transition hover:shadow-lg">
      <p className="text-sm font-medium text-indigo-500 uppercase tracking-wider">{title}</p>
      <h2 className="text-3xl mt-1 mb-3 font-bold text-gray-900">{value}</h2>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );

  return (
    <div>
      <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Dashboard Overview</h1>
      <p className="text-lg text-gray-600 border-b pb-4 mb-8">Welcome back! Here is a summary of the system resources and key metrics.</p>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
            <span className="block sm:inline">{error}</span>
        </div>
      )}

      {!loading && widgets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {widgets.map((widget) => (
            <DashboardCard key={widget.title} {...widget} />
          ))}
        </div>
      ) : !loading && widgets.length === 0 ? (
         <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
            No summary data available. Please ensure the backend API is running and that the current user has READ permissions on resource types.
        </div>
      ) : (
        <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
            Loading dashboard data... Please wait.
        </div>
      )}

      {/* Call to Action / Next Steps Section */}
       <div className="mt-12 p-6 bg-indigo-50 rounded-xl shadow-inner border border-indigo-200">
          <h3 className="text-xl font-semibold text-indigo-800 mb-4">Action Items</h3>
          <p className="mb-4 text-gray-700">Use the navigation sidebar to manage system resources and configure access policies.</p>
          <div className="flex space-x-4">
             <Link href="/groups" className="py-2 px-6 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg shadow transition duration-150">
                Manage Groups
            </Link>
             <Link href="/objects" className="py-2 px-6 border border-indigo-500 hover:bg-indigo-100 text-indigo-700 rounded-lg shadow transition duration-150">
                Manage Objects
            </Link>
          </div>
      </div>

    </div>
  );
}