"use client";

import { FormEvent, useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/apiUtils';
import PermissionModal, { UpdatePolicyPayload } from '@/components/ui/PermissionModal';

interface GroupRecord {
  _id: string;
  name: string;
}

interface PermissionRecord {
  _id: string;
  groupId: string;
  resourceType: string;
  target: string;
  permission: string;
}

export default function AdminPermissionsPage() {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [policyModalOpen, setPolicyModalOpen] = useState(false);

  const loadGroups = async () => {
    setError(null);
    try {
      const data = await apiGet<GroupRecord[]>('/groups');
      setGroups(data);
      if (!selectedGroupId && data[0]?._id) {
        setSelectedGroupId(data[0]._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups.');
    }
  };

  const loadPermissions = async (groupId: string) => {
    if (!groupId) {
      setPermissions([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ permissions: PermissionRecord[] }>(`/groups/${groupId}/permissions`);
      setPermissions(data.permissions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions.');
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      loadPermissions(selectedGroupId);
    }
  }, [selectedGroupId]);

  const selectedGroup = groups.find((group) => group._id === selectedGroupId) || null;

  const handleUpdatePolicy = async (payload: UpdatePolicyPayload) => {
    if (!selectedGroupId) return;
    setError(null);
    try {
      await apiPost(`/groups/${selectedGroupId}/permissions`, {
        scopes: payload.scopes,
        target: payload.target,
        resourceType: payload.resourceType.toUpperCase(),
      });
      await loadPermissions(selectedGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permissions.');
    }
  };

  const openPolicyModal = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGroupId) {
      setError('Select a group first.');
      return;
    }
    setPolicyModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
          Admin / Permissions
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Permission management</h1>
        <p className="mt-2 text-[var(--muted)]">
          Permissions are stored in the permissions table and assigned to groups.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      )}

      <form
        onSubmit={openPolicyModal}
        className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:flex-row"
      >
        <select
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          className="flex-1 rounded-md border border-[var(--border)] px-3 py-2"
        >
          <option value="">Select group</option>
          {groups.map((group) => (
            <option key={group._id} value={group._id}>
              {group.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-strong)]"
        >
          Edit policy
        </button>
      </form>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">
          {selectedGroup ? `${selectedGroup.name} policies` : 'Select a group'}
        </h2>
        {loading ? (
          <p className="mt-4 text-[var(--muted)]">Loading…</p>
        ) : !selectedGroup ? (
          <p className="mt-4 text-[var(--muted)]">Choose a group to inspect its permissions.</p>
        ) : !permissions.length ? (
          <p className="mt-4 text-[var(--muted)]">No permissions assigned yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {permissions.map((permission) => (
              <li
                key={permission._id}
                className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="font-medium">{permission.permission}</span>
                {' on '}
                <span>{permission.resourceType}</span>
                {' / '}
                <span>{permission.target}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PermissionModal
        resourceType="group"
        isOpen={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        onUpdatePolicy={handleUpdatePolicy}
      />
    </div>
  );
}
