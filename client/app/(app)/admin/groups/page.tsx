"use client";

import { FormEvent, useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '@/lib/apiUtils';
import EditMembersModal, { EditMembersPayload } from '@/components/ui/EditMembersModal';
import Breadcrumbs from '@/components/ui/Breadcrumbs';

interface GroupRecord {
  _id: string;
  name: string;
  description?: string;
  members?: string[];
}

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [memberModalOpen, setMemberModalOpen] = useState(false);

  const selectedGroup = groups.find((group) => group._id === selectedGroupId) || null;

  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<GroupRecord[]>('/groups');
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await apiPost('/groups', { name, description });
      setName('');
      setDescription('');
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group.');
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await apiDelete(`/groups/${id}`);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group.');
    }
  };

  const handleAddMember = async ({ userId }: EditMembersPayload) => {
    if (!selectedGroupId) return;
    await apiPost(`/groups/${selectedGroupId}/members`, { targetUserId: userId });
    await loadGroups();
  };

  const handleRemoveMember = async ({ userId }: EditMembersPayload) => {
    if (!selectedGroupId) return;
    await apiDelete(`/groups/${selectedGroupId}/members`, { targetUserId: userId });
    await loadGroups();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Groups' },
          ]}
        />
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">Admin / Groups</p>
        <h1 className="mt-2 text-3xl font-semibold">Group management</h1>
        <p className="mt-2 text-[var(--muted)]">Create groups and attach members for shared roles.</p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          required
          className="rounded-md border border-[var(--border)] px-3 py-2"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          className="rounded-md border border-[var(--border)] px-3 py-2"
        />
        <button
          type="button"
          onClick={() => {
            setName('');
            setDescription('');
          }}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)]"
        >
          Create group
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {loading ? (
          <p className="p-5 text-[var(--muted)]">Loading groups…</p>
        ) : groups.length === 0 ? (
          <p className="p-5 text-[var(--muted)]">No groups found.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Members</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group._id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-medium">{group.name}</td>
                  <td className="px-4 py-3">{group.description || '—'}</td>
                  <td className="px-4 py-3">{group.members?.length || 0}</td>
                  <td className="space-x-3 px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroupId(group._id);
                        setMemberModalOpen(true);
                      }}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Edit members
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(group._id)}
                      className="text-[var(--danger)] hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <EditMembersModal
        isOpen={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        groupName={selectedGroup?.name}
        memberIds={selectedGroup?.members?.map(String) || []}
        onAddUser={handleAddMember}
        onRemoveUser={handleRemoveMember}
      />
    </div>
  );
}
