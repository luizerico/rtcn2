// client/components/Sidebar.tsx
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-gray-800 text-white h-full p-6 flex flex-col fixed">
      <h1 className="text-2xl font-bold mb-10 text-indigo-400">RBAC Console</h1>
      
      <nav className="flex flex-col space-y-2 flex-grow">
        <Link href="/dashboard" className={`p-3 rounded-lg transition duration-150 ${pathname === '/dashboard' ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'}`}>
          Dashboard Overview
        </Link>

        <h3 className="text-xs font-semibold uppercase text-gray-400 mt-6 mb-2">Resource Management</h3>
        
        <Link href="/groups" className={`p-3 rounded-lg transition duration-150 ${pathname === '/groups' ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'}`}>
          Groups <span className="text-sm opacity-70 ml-2">({} Members)</span>
        </Link>
        
        <Link href="/objects" className={`p-3 rounded-lg transition duration-150 ${pathname === '/objects' ? 'bg-gray-700 text-white' : 'hover:bg-gray-700'}`}>
          Objects <span className="text-sm opacity-70 ml-2">()</span>
        </Link>

        {/* Placeholder for User/Profile actions */}
        <div className='pt-4 border-t border-gray-700 mt-auto'>
            <button 
                onClick={() => window.location.href = '/login'} 
                className="w-full text-left p-3 rounded-lg transition duration-150 hover:bg-red-600 text-white"
            >
                Logout
            </button>
        </div>
      </nav>
    </div>
  );
}