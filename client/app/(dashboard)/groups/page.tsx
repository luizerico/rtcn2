"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/apiUtils';
import AddMemberModal, { AddMemberPayload } from '@/components/ui/AddMemberModal';
import PermissionModal, { UpdatePolicyPayload } from '@/components/ui/PermissionModal';

interface GroupModel {
  _id: string;
  name: string;
  description: string;
  members: string[];
  createdAt: Date;
  updatedAt: Date;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);

  useEffect(() => {
    async function fetchGroups() {
      try {
        const data = await apiGet<GroupModel[]>('/groups');
        setGroups(data);
      } catch (err) {
        console.error('Failed to fetch groups:', err);
        setError('Failed to load groups. Ensure your API is running and you have GROUP:READ permissions.');
      } finally {
        setLoading(false);
      }
    }

    fetchGroups();
  }, []);

  const openMemberModal = (groupId: string) => {
    setSelectedGroupId(groupId);
    setIsMemberModalOpen(true);
  };

  const openPermissionModal = (groupId: string) => {
    setSelectedGroupId(groupId);
    setIsPermissionModalOpen(true);
  };

  const handleAddUser = async ({ userId }: AddMemberPayload) => {
    if (!selectedGroupId) return;

    try {
      await apiPost(`/groups/${selectedGroupId}/members`, { targetUserId: userId });
      setGroups((prev) =>
        prev.map((group) =>
          group._id === selectedGroupId
            ? { ...group, members: [...(group.members || []), userId] }
            : group
        )
      );
    } catch (err) {
      console.error('Error adding member:', err);
      setError('Failed to add user to group.');
    }
  };

  const handleSavePermissions = async (payload: UpdatePolicyPayload) => {
    if (!selectedGroupId) return;

    try {
      await apiPost(`/groups/${selectedGroupId}/permissions`, {
        scopes: payload.scopes,
        target: payload.target,
        resourceType: payload.resourceType.toUpperCase(),
      });
    } catch (err) {
      console.error('Error saving permissions:', err);
      setError('Failed to save group permissions.');
    }
  };

  if (loading) {
    return <div className="p-10 text-center">Loading Groups...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center border-b pb-4 mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Group Management</h1>
        <button
          type="button"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow transition duration-150 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Create New Group
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
          <h2 className="text-xl font-semibold text-gray-900">Available Groups ({groups.length})</h2>
          <input
            type="search"
            placeholder="Search groups by name or description..."
            className="p-2 border rounded-md w-72 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="overflow-hidden border-b">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-6 py-3">Name</th>
                <th scope="col" className="px-6 py-3">Description</th>
                <th scope="col" className="px-6 py-3">Members</th>
                <th scope="col" className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groups.map((group) => (
                <tr key={group._id} className="hover:bg-gray-50 transition duration-100">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">{group.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-[200px] truncate">
                    {group.description || 'No description provided.'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {group.members?.length > 0 ? `${group.members.length} Members` : 'No Members'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Link href={`/groups/${group._id}`} className="text-indigo-600 hover:text-indigo-900">
                      View
                    </Link>
                    <button
                      type="button"
                      onClick={() => openMemberModal(group._id)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Add Member
                    </button>
                    <button
                      type="button"
                      onClick={() => openPermissionModal(group._id)}
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
        resourceType="group"
        isOpen={isMemberModalOpen}
        onClose={() => setIsMemberModalOpen(false)}
        onAddUser={handleAddUser}
      />
      <PermissionModal
        resourceType="group"
        isOpen={isPermissionModalOpen}
        onClose={() => setIsPermissionModalOpen(false)}
        onUpdatePolicy={handleSavePermissions}
      />
    </div>
  );
}
