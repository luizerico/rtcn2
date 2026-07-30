"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/apiUtils';
import AddMemberModal, { AddMemberPayload } from '@/components/ui/AddMemberModal';
import PermissionModal, { UpdatePolicyPayload } from '@/components/ui/PermissionModal';

interface ObjectModel {
  _id: string;
  name: string;
  description: string;
  ownerId: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function ObjectsPage() {
  const [objects, setObjects] = useState<ObjectModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);

  useEffect(() => {
    async function fetchObjects() {
      try {
        const data = await apiGet<ObjectModel[]>('/objects');
        setObjects(data);
      } catch (err) {
        console.error('Failed to fetch objects:', err);
        setError('Failed to load objects. Ensure your API is running and you have OBJECT:READ permissions.');
      } finally {
        setLoading(false);
      }
    }

    fetchObjects();
  }, []);

  const openMemberModal = (objectId: string) => {
    setSelectedObjectId(objectId);
    setIsMemberModalOpen(true);
  };

  const openPermissionModal = (objectId: string) => {
    setSelectedObjectId(objectId);
    setIsPermissionModalOpen(true);
  };

  const handleAddUser = async ({ userId }: AddMemberPayload) => {
    if (!selectedObjectId) return;

    try {
      await apiPost(`/objects/${selectedObjectId}/members`, { targetUserId: userId });
    } catch (err) {
      console.error('Error adding member:', err);
      setError('Failed to add user to object policy.');
    }
  };

  const handleSavePermissions = async (payload: UpdatePolicyPayload) => {
    if (!selectedObjectId) return;

    try {
      await apiPost(`/objects/${selectedObjectId}/permissions`, {
        scopes: payload.scopes,
        target: payload.target,
        resourceType: payload.resourceType.toUpperCase(),
      });
    } catch (err) {
      console.error('Error saving permissions:', err);
      setError('Failed to save object policies.');
    }
  };

  if (loading) {
    return <div className="p-10 text-center">Loading Objects...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center border-b pb-4 mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Object Resource Management</h1>
        <button
          type="button"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow transition duration-150 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Create New Object Type
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Available Object Types ({objects.length})</h2>
          <input
            type="search"
            placeholder="Search object types by name or description..."
            className="p-2 border rounded-md w-72 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="overflow-hidden border-b">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-6 py-3">Name</th>
                <th scope="col" className="px-6 py-3">Description</th>
                <th scope="col" className="px-6 py-3">Owner</th>
                <th scope="col" className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {objects.map((object) => (
                <tr key={object._id} className="hover:bg-gray-50 transition duration-100">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">{object.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-[200px] truncate">
                    {object.description || 'No description provided.'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {object.ownerId ? `Owned by User ID: ${object.ownerId.substring(0, 8)}...` : 'System'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Link href={`/objects/${object._id}`} className="text-indigo-600 hover:text-indigo-900">
                      View
                    </Link>
                    <button
                      type="button"
                      onClick={() => openMemberModal(object._id)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Add Member
                    </button>
                    <button
                      type="button"
                      onClick={() => openPermissionModal(object._id)}
                      className="text-orange-600 hover:text-orange-900"
                    >
                      Policies
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddMemberModal
        resourceType="object"
        isOpen={isMemberModalOpen}
        onClose={() => setIsMemberModalOpen(false)}
        onAddUser={handleAddUser}
      />
      <PermissionModal
        resourceType="object"
        isOpen={isPermissionModalOpen}
        onClose={() => setIsPermissionModalOpen(false)}
        onUpdatePolicy={handleSavePermissions}
      />
    </div>
  );
}
