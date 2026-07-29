// client/app/(dashboard)/objects/[objectId]/page.tsx
"use client";

import { apiGet } from '@/lib/apiUtils';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Represents the full model for a managed Object resource type.
 */
interface ObjectModelDetail {
  _id: string;
  name: string;
  description: string;
  ownerId: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function ObjectDetailPage({ params }: { params: { objectId: string } }) {
  const [object, setObject] = useState<ObjectModelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchObjectDetails() {
      setLoading(true);
      setError(null);
      try {
        // Calls the GET /api/objects/:objectId endpoint (protected by OBJECT:READ)
        const data = await apiGet(`/objects/${params.objectId}`); 
        setObject(data as ObjectModelDetail);
      } catch (err) {
        console.error("Failed to fetch object details:", err);
        setError('Failed to load object details. Please check the Object ID or ensure you have OBJECT:READ permissions.');
      } finally {
        setLoading(false);
      }
    }
    fetchObjectDetails();
  }, [params.objectId]);

  if (loading) {
    return <div className="p-10 text-center">Loading Object Details...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
        <p className="font-bold">Error Loading Object Details</p>
        <p>{error}</p>
      </div>
    );
  }

  const objectId = params.objectId;
  const displayObjectName = object?.name || 'Object';


  return (
    <div className="max-w-4xl mx-auto space-y-8">
        {/* Header and Summary */}
      <div>
          <h1 className="text-3xl font-extrabold text-gray-900 border-b pb-2 mb-6">{displayObjectName} Management</h1>

          <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6 border border-indigo-100">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Summary</h2>
            <p className='mb-3'><strong>Object ID:</strong> <span className="font-mono bg-gray-100 px-2 py-1 rounded">{objectId}</span></p>
            <p className='mb-6 text-lg'>{object.description}</p>

            {/* Key Attributes */}
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div><strong>Owner:</strong> <span className="text-indigo-600">{object.ownerId ? object.ownerId.substring(0, 8) + '...' : 'N/A'}</span></div>
                <div><strong>Status:</strong> <span className={`font-bold ${object.isArchived ? 'text-red-500' : 'text-green-600'}`}>{object.isArchived ? 'Archived' : 'Active'}</span></div>
            </div>

            {/* Action Buttons (Edit/Toggle Archive) */}
            <div className="mt-8 flex gap-4 pt-6 border-t">
                <button 
                    // This would call apiPut /api/objects/:objectId for updates (name, description, etc.)
                    className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 px-4 rounded-lg shadow transition">
                    Edit Definition
                </button>
                <button 
                    // This would call apiPut /api/objects/:objectId for state change (archiving)
                    className={`py-2 px-4 rounded-lg shadow transition ${object.isArchived ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} text-white font-medium`}>
                    {object.isArchived ? 'Restore Object' : 'Archive Object'}
                </button>
            </div>
          </div>
      </div>

      {/* Policy & Membership Management */}
      <div className="p-6 bg-gray-50 rounded-xl shadow border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Policy and Access Control</h3>
        <p className='mb-4 text-gray-600'>Configure which Groups/Roles have specific CRUD permissions for this object type.</p>

        {/* Example policy configuration section */}
        <div className="space-y-3 border p-4 rounded-md bg-white">
            <h4 className="font-semibold text-gray-700">Resource Permissions</h4>
            <label className="block text-sm font-medium text-gray-700 mt-2">Global Read Scope (Can read by any group member?)</label>
            <select className="mt-1 block w-full p-2 border rounded-md shadow-sm">
                <option>Yes</option>
                <option>No</option>
            </select>

            <h4 className="font-semibold text-gray-700 mt-4">Group Overrides (Explicitly granting/denying access)</h4>
            {/* Placeholder for rendering Group membership list and modification buttons */}
             <p className='text-sm italic text-gray-500'>List of groups and corresponding policy controls will appear here.</p>
        </div>

      </div>
    </div>
  );