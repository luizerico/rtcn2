"use client";

import React, { FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import { apiGet } from '@/lib/apiUtils';
import type { PaginatedList } from '@/lib/listTypes';

interface UserRecord {
  _id: string;
  username: string;
  email: string;
}

export interface EditMembersPayload {
  userId: string;
}

interface EditMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName?: string;
  memberIds?: string[];
  onAddUser: (data: EditMembersPayload) => void | Promise<void>;
  onRemoveUser: (data: EditMembersPayload) => void | Promise<void>;
}

const EditMembersModal: React.FC<EditMembersModalProps> = ({
  isOpen,
  onClose,
  groupName,
  memberIds = [],
  onAddUser,
  onRemoveUser,
}) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ userId: string; username: string } | null>(
    null
  );
  const searchId = useId();

  const memberIdSet = useMemo(() => new Set(memberIds.map(String)), [memberIds]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSelectedUserId('');
      setError(null);
      setUsers([]);
      setLoading(false);
      setBusyUserId(null);
      setPendingRemove(null);
      return;
    }

    setLoading(true);
    apiGet<PaginatedList<UserRecord>>('/users?limit=100&sort=username&order=asc')
      .then((list) => setUsers(Array.isArray(list.items) ? list.items : []))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load users.');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const currentMembers = useMemo(
    () =>
      users
        .filter((user) => memberIdSet.has(String(user._id)))
        .sort((a, b) => a.username.localeCompare(b.username)),
    [users, memberIdSet]
  );

  const searchableUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users
      .filter((user) => !memberIdSet.has(String(user._id)))
      .filter((user) => {
        if (!query) return true;
        return (
          user.username.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
        );
      })
      .slice(0, 50);
  }, [users, search, memberIdSet]);

  const selectedUser =
    searchableUsers.find((user) => user._id === selectedUserId) ||
    users.find((user) => user._id === selectedUserId);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedUserId) {
      setError('Select a user from the search results.');
      return;
    }

    setBusyUserId(selectedUserId);
    setError(null);
    try {
      await onAddUser({ userId: selectedUserId });
      setSelectedUserId('');
      setSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = (userId: string, username: string) => {
    setPendingRemove({ userId, username });
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    setBusyUserId(pendingRemove.userId);
    setError(null);
    try {
      await onRemoveUser({ userId: pendingRemove.userId });
      setPendingRemove(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member.');
    } finally {
      setBusyUserId(null);
    }
  };

  const title = groupName ? `Edit members — ${groupName}` : 'Edit members';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-5">
        <section>
          <h4 className="mb-2 text-sm font-medium">Current members ({currentMembers.length})</h4>
          <ul className="max-h-40 overflow-y-auto rounded-md border border-[var(--border)]">
            {loading ? (
              <li className="px-3 py-4 text-sm text-[var(--muted)]">Loading members…</li>
            ) : currentMembers.length === 0 ? (
              <li className="px-3 py-4 text-sm text-[var(--muted)]">No members in this group yet.</li>
            ) : (
              currentMembers.map((user) => (
                <li
                  key={user._id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.username}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleRemove(user._id, user.username);
                    }}
                    disabled={busyUserId === user._id}
                    className="shrink-0 text-sm text-[var(--danger)] hover:underline disabled:opacity-50"
                  >
                    {busyUserId === user._id ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <form onSubmit={handleAdd} className="space-y-3 border-t border-[var(--border)] pt-4">
          <h4 className="text-sm font-medium">Create member</h4>
          <div>
            <label htmlFor={searchId} className="mb-2 block text-sm font-medium">
              Search users
            </label>
            <input
              id={searchId}
              type="search"
              placeholder="Search by username or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedUserId('');
                if (error) setError(null);
              }}
              autoComplete="off"
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div
            className="max-h-40 overflow-y-auto rounded-md border border-[var(--border)]"
            role="listbox"
            aria-label="Search results"
          >
            {loading ? (
              <p className="px-3 py-4 text-sm text-[var(--muted)]">Loading users…</p>
            ) : searchableUsers.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--muted)]">
                {search.trim() ? 'No users match your search.' : 'No users available to add.'}
              </p>
            ) : (
              searchableUsers.map((user) => {
                const selected = user._id === selectedUserId;
                return (
                  <button
                    key={user._id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setSelectedUserId(user._id);
                      if (error) setError(null);
                    }}
                    className={`flex w-full flex-col px-3 py-2 text-left text-sm ${
                      selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]/50'
                    }`}
                  >
                    <span className="font-medium">{user.username}</span>
                    <span className="text-xs text-[var(--muted)]">{user.email}</span>
                  </button>
                );
              })
            )}
          </div>

          {selectedUser && (
            <p className="text-sm text-[var(--muted)]">
              Selected:{' '}
              <span className="font-medium text-[var(--foreground)]">{selectedUser.username}</span>
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)]"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={!selectedUserId || loading || Boolean(busyUserId)}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyUserId && busyUserId === selectedUserId ? 'Creating…' : 'Create member'}
            </button>
          </div>
        </form>
      </div>
      <ConfirmDeleteDialog
        isOpen={Boolean(pendingRemove)}
        onClose={() => setPendingRemove(null)}
        onConfirm={confirmRemove}
        title="Remove member"
        itemLabel={pendingRemove?.username}
        description={
          pendingRemove
            ? `Remove “${pendingRemove.username}” from this group?`
            : undefined
        }
        confirmLabel="Remove"
        busy={Boolean(pendingRemove && busyUserId === pendingRemove.userId)}
      />
    </Modal>
  );
};

export default EditMembersModal;

/** @deprecated Use EditMembersPayload */
export type AddMemberPayload = EditMembersPayload;
