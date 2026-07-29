// client/app/(dashboard)/objects/page.tsx
"use client";

import { apiGet } from '@/lib/apiUtils';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AddMemberModal from '@/components/ui/AddMemberModal'; // Assuming path correction if needed
import PermissionModal from '@/components/ui/PermissionModal'; // Assuming path correction if needed

/**
 * Represents a managed Object resource (e.g., a specific document type or module).
 */
interface ObjectModel {
  _id: string;
  name: string; // e.g., "User Profile", "Billing Document"
  description: string;
  ownerId: string; // User ID that owns this object definition/type
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function ObjectsPage() {
  const [objects, setObjects] = useState<ObjectModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);

  // Handlers for Advanced Policies (Object context)
  const handleAddUserObject = async (userId: string) => {
    try {
      await apiGet(`/objects/add-member?userId=${userId}`); 
      alert('Successfully added user to Object policy.');
    } catch (error) {
      console.error("Error adding member:", error);
      alert('Failed to add user to Object policy.');
    } finally {
      setIsMemberModalOpen(false);
    }
  };

  const handleSavePermissionsObject = async (isValid: boolean) => {
    if (!isValid) return;
    try {
      await apiGet(`/objects/update-permissions`); 
      alert('Successfully saved Object policies.');
    } catch (error) {
      console.error("Error saving permissions:", error);
      alert('Failed to save Object policies.');
    } finally {
      setIsPermissionModalOpen(false);
    }
  };

  useEffect(() => {
    async function fetchObjects() {
      try {
        // Calls the GET /api/objects endpoint (protected by authorize('OBJECT:READ'))
        const data = await apiGet('/objects'); 
        setObjects(data);
      } catch (err) {
        console.error("Failed to fetch objects:", err);
        setError('Failed to load objects. Ensure your API is running and you have OBJECT:READ permissions.');
      } finally {
        setLoading(false);
      }
    }
    fetchObjects();
  }, []);

// ... rest of the component remains largely the same, using the new handlers/state (e.g., lines 130-158)

/**
 * Represents a managed Object resource (e.g., a specific document type or module).
 */
interface ObjectModel {
  _id: string;
  name: string; // e.g., "User Profile", "Billing Document"
  description: string;
  ownerId: string; // User ID that owns this object definition/type
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function ObjectsPage() {
  const [objects, setObjects] = useState<ObjectModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchObjects() {
      try {
        // Calls the GET /api/objects endpoint (protected by authorize('OBJECT:READ'))
        const data = await apiGet('/objects'); 
        setObjects(data);
      } catch (err) {
        console.error("Failed to fetch objects:", err);
        setError('Failed to load objects. Ensure your API is running and you have OBJECT:READ permissions.');
      } finally {
        setLoading(false);
      }
    }
    fetchObjects();
  }, []);

  if (loading) {
    return <div className="p-10 text-center">Loading Objects...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
        <p className="font-bold">Error Loading Objects</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Section Title and Create Button */}
      <div>
        <div className="flex justify-between items-center border-b pb-4 mb-6">
          <h1 className="text-3xl font-extrabold text-gray-900">Object Resource Management</h1>
          <button 
              // This button should trigger a modal or navigate to a creation form, requiring OBJECT:CREATE permission.
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow transition duration-150 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            Create New Object Type
          </button>
        </div>

        {/* Table Listing */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="p-4 border-b flex justify-between items-center">
             <h2 className="text-xl font-semibold text-gray-900">Available Object Types ({objects.length})</h2>
             {/* Placeholder for Group Filtering/Searching */}
            <input type="search" placeholder="Search object types by name or description..." className="p-2 border rounded-md w-72 focus:ring-indigo-500 focus:border-indigo-500"/>
          </div>

          <div className="overflow-hidden border-b">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3">Name</th>
                  <th scope="col" className="px-6 py-3 max-w-[200px] truncate">Description</th>
                  <th scope="col" className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">Owner</th>
                  <th scope="col" className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {objects.map((object) => (
                  <tr key={object._id} className="hover:bg-gray-50 transition duration-100 cursor-pointer">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">{object.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-[200px] truncate">{object.description || 'No description provided.'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {object.ownerId ? `Owned by User ID: ${object.ownerId.substring(0, 8)}...` : 'System'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <Link href={`/objects/${object._id}`} className="text-indigo-600 hover:text-indigo-900">View</Link>
                      {/* Edit button placeholder */}
                      <button className="text-yellow-600 hover:text-yellow-900" title="Edit">Edit</button> 
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-10 p-6 bg-gray-50 rounded-xl shadow border border-gray-200">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Advanced Policies</h3>
            <p className='mb-6 text-gray-600'>This section manages the core RBAC policies: which Object types this object can READ/WRITE/DELETE, and handles overall membership synchronization.</p>
            <div className="flex gap-4">
                <AddMemberModal resourceType={"object"} />
                <PermissionModal resourceType={"object"} />
            </div>
        </div>

        {/* Modals */}
        <AddMemberModal onUserAdded={handleAddUser} resourceType="Object" />
        <PermissionModal onSavePolicies={() => {}} resourceType="Object" objectId={`object_${objects.length}`} />
        {/* Advanced Policies Section */}
        <div className="mt-10 p-6 bg-gray-50 rounded-xl shadow border border-gray-200">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Advanced Policies</h3>
            <p className='mb-6 text-gray-600'>This section manages the core RBAC policies: which Object types this group can READ/WRITE/DELETE, and handles overall membership synchronization.</p>
            <div className="flex gap-4">
                {/* Trigger Member Modal */}
                <button 
                    onClick={() => setIsMemberModalOpen(true)} // Assuming state setup for member modal is done above or needed.
                    className="py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow transition flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9l-6-6-6 6"></path></svg>
                    + Add Member (User ID)
                </button>

                {/* Trigger Permission Modal */}
                <button 
                    onClick={() => setIsPermissionModalOpen(true)} // Assuming state setup for permission modal is done above or needed.
                    className="py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg shadow transition flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Manage Policies (RBAC)
                </button>
            </div>
        </div>

        {/* Modals (These would need to be defined/imported correctly) */}
        <AddMemberModal />
        <PermissionModal />
        </div>
      </div>
    </div>
  );