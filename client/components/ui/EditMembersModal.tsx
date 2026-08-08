"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { AccessIconButton } from '@/components/ui/TableActionIcon';
import { apiGet } from '@/lib/apiUtils';
import type { PaginatedList } from '@/lib/listTypes';

interface UserRecord {
  _id: string;
  username: string;
  email: string;
}

export interface EditMembersSavePayload {
  addUserIds: string[];
  removeUserIds: string[];
}

/** @deprecated Use EditMembersSavePayload */
export interface EditMembersPayload {
  userId: string;
}

interface EditMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName?: string;
  memberIds?: string[];
  onSave: (data: EditMembersSavePayload) => void | Promise<void>;
}

function normalizeUserList(payload: unknown): UserRecord[] {
  if (Array.isArray(payload)) return payload as UserRecord[];
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as PaginatedList<UserRecord>).items)
  ) {
    return (payload as PaginatedList<UserRecord>).items;
  }
  return [];
}

function sortedUniqueIds(ids: Iterable<string>): string[] {
  return [...new Set([...ids].map(String))].sort();
}

const EditMembersModal: React.FC<EditMembersModalProps> = ({
  isOpen,
  onClose,
  groupName,
  memberIds = [],
  onSave,
}) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [draftMemberIds, setDraftMemberIds] = useState<string[]>([]);
  const [initialMemberIds, setInitialMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchId = useId();
  const memberIdsRef = useRef(memberIds);
  memberIdsRef.current = memberIds;

  const draftMemberIdSet = useMemo(() => new Set(draftMemberIds.map(String)), [draftMemberIds]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setError(null);
      setUsers([]);
      setDraftMemberIds([]);
      setInitialMemberIds([]);
      setLoading(false);
      setSaving(false);
      return;
    }

    const baseline = sortedUniqueIds(memberIdsRef.current);
    setDraftMemberIds(baseline);
    setInitialMemberIds(baseline);
    setLoading(true);
    apiGet<PaginatedList<UserRecord> | UserRecord[]>('/users?limit=100&sort=username&order=asc')
      .then((list) => setUsers(normalizeUserList(list)))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load users.');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const currentMembers = useMemo(
    () =>
      users
        .filter((user) => draftMemberIdSet.has(String(user._id)))
        .sort((a, b) => a.username.localeCompare(b.username)),
    [users, draftMemberIdSet]
  );

  const availableUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users
      .filter((user) => !draftMemberIdSet.has(String(user._id)))
      .filter((user) => {
        if (!query) return true;
        return (
          user.username.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, 50);
  }, [users, search, draftMemberIdSet]);

  const { addUserIds, removeUserIds, dirty } = useMemo(() => {
    const initial = new Set(initialMemberIds.map(String));
    const draft = new Set(draftMemberIds.map(String));
    const add = [...draft].filter((id) => !initial.has(id));
    const remove = [...initial].filter((id) => !draft.has(id));
    return {
      addUserIds: add,
      removeUserIds: remove,
      dirty: add.length > 0 || remove.length > 0,
    };
  }, [draftMemberIds, initialMemberIds]);

  const handleAdd = (userId: string) => {
    setDraftMemberIds((prev) => sortedUniqueIds([...prev, userId]));
    setError(null);
  };

  const handleRemove = (userId: string) => {
    setDraftMemberIds((prev) => prev.filter((id) => String(id) !== String(userId)));
    setError(null);
  };

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ addUserIds, removeUserIds });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save members.');
    } finally {
      setSaving(false);
    }
  };

  const title = groupName ? `Edit members — ${groupName}` : 'Edit members';
  const listShellClass =
    'h-56 overflow-y-auto rounded-md border border-[var(--border)]';
  const searchFieldClass =
    'w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="space-y-4">
        <div className="grid items-start gap-4 md:grid-cols-2">
          <section className="grid min-w-0 grid-rows-[auto_auto_1fr] gap-2">
            <h4 className="text-sm font-medium">Available users ({availableUsers.length})</h4>
            <input
              id={searchId}
              type="search"
              placeholder="Search by username or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (error) setError(null);
              }}
              autoComplete="off"
              className={searchFieldClass}
            />
            <ul className={listShellClass} aria-label="Available users">
              {loading ? (
                <li className="px-3 py-4 text-sm text-[var(--muted)]">Loading users…</li>
              ) : availableUsers.length === 0 ? (
                <li className="px-3 py-4 text-sm text-[var(--muted)]">
                  {search.trim() ? 'No users match your search.' : 'No users available to add.'}
                </li>
              ) : (
                availableUsers.map((user) => (
                  <li
                    key={user._id}
                    className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.username}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
                    </div>
                    <AccessIconButton
                      allowed
                      icon="add"
                      label="Add member"
                      disabled={saving}
                      onClick={() => handleAdd(user._id)}
                    />
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="grid min-w-0 grid-rows-[auto_auto_1fr] gap-2">
            <h4 className="text-sm font-medium">Group members ({currentMembers.length})</h4>
            {/* Spacer matches the search field height so both lists align on desktop. */}
            <div
              className={`${searchFieldClass} pointer-events-none invisible hidden select-none md:block`}
              aria-hidden
            >
              &nbsp;
            </div>
            <ul className={listShellClass} aria-label="Group members">
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
                    <AccessIconButton
                      allowed
                      icon="delete"
                      label="Remove member"
                      danger
                      disabled={saving}
                      onClick={() => handleRemove(user._id)}
                    />
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={!dirty || saving || loading}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default EditMembersModal;

/** @deprecated Use EditMembersSavePayload */
export type AddMemberPayload = EditMembersPayload;
