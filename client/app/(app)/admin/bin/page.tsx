"use client";

import { useCallback, useEffect, useState } from 'react';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';
import { useAccess } from '@/components/AccessProvider';
import { useToast } from '@/components/ToastProvider';
import { apiDelete, apiDownload, apiGet, apiPost } from '@/lib/apiUtils';
import {
  BIN_TYPE_FILTERS,
  binActorLabel,
  binTypeLabel,
  type RecycleBinItem,
} from '@/lib/recycleBinTypes';

export default function AdminRecycleBinPage() {
  const { isAdmin, ready } = useAccess();
  const { pushToast } = useToast();
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingPurge, setPendingPurge] = useState<RecycleBinItem | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = typeFilter ? `?type=${encodeURIComponent(typeFilter)}` : '';
      const data = await apiGet<{ items: RecycleBinItem[] }>(`/bin${query}`);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recycle bin.');
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    if (!ready || !isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [ready, isAdmin, load]);

  const handleRestore = async (row: RecycleBinItem) => {
    setBusy(true);
    try {
      await apiPost(`/bin/${row.itemType}/${row._id}/restore`);
      setItems((prev) => prev.filter((item) => !(item._id === row._id && item.itemType === row.itemType)));
      pushToast({
        tone: 'success',
        title: `${binTypeLabel(row.itemType)} restored`,
        message: row.name,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Restore failed',
        message: err instanceof Error ? err.message : 'Failed to restore item.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePurge = async () => {
    if (!pendingPurge) return;
    setBusy(true);
    try {
      await apiDelete(`/bin/${pendingPurge.itemType}/${pendingPurge._id}`);
      setItems((prev) =>
        prev.filter((item) => !(item._id === pendingPurge._id && item.itemType === pendingPurge.itemType))
      );
      pushToast({
        tone: 'success',
        title: `${binTypeLabel(pendingPurge.itemType)} permanently deleted`,
        message: pendingPurge.name,
      });
      setPendingPurge(null);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Failed to permanently delete item.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleEmpty = async () => {
    setBusy(true);
    try {
      const result = await apiDelete<{ deleted?: number }>('/bin');
      setItems([]);
      setEmptyOpen(false);
      pushToast({
        tone: 'success',
        title: 'Recycle bin emptied',
        message: `${result.deleted ?? 0} item(s) permanently deleted.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Empty bin failed',
        message: err instanceof Error ? err.message : 'Failed to empty recycle bin.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (row: RecycleBinItem) => {
    try {
      await apiDownload(`/files/bin/${row._id}/content`, row.name);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Download failed',
        message: err instanceof Error ? err.message : 'Failed to download file.',
      });
    }
  };

  if (!ready) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Recycle bin' }]} />
        <p className="text-[var(--muted)]">Admin access is required to view the recycle bin.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-6">
        <div>
          <Breadcrumbs
            items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Recycle bin' }]}
          />
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Recycle bin</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Files, records, users, groups, and survey answers stay here until restored or permanently deleted.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={() => setEmptyOpen(true)}
          className="rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          Empty bin
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-[var(--muted)]" htmlFor="bin-type-filter">
          Type
        </label>
        <select
          id="bin-type-filter"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
        >
          {BIN_TYPE_FILTERS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
          {error}
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="text-[var(--muted)]">The recycle bin is empty.</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {items.map((row) => (
            <li key={`${row.itemType}-${row._id}`} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium">
                      {binTypeLabel(row.itemType)}
                    </span>
                    <p className="font-medium">{row.name}</p>
                  </div>
                  {row.detail ? <p className="mt-1 text-xs text-[var(--muted)]">{row.detail}</p> : null}
                  <p className="text-xs text-[var(--muted)]">
                    Deleted {row.deletedAt ? new Date(row.deletedAt).toLocaleString() : '—'} by{' '}
                    {binActorLabel(row.deletedBy)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.itemType === 'FILE' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDownload(row)}
                      className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)]/40 disabled:opacity-60"
                    >
                      Download
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRestore(row)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)]/40 disabled:opacity-60"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingPurge(row)}
                    className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingPurge)}
        onClose={() => setPendingPurge(null)}
        onConfirm={handlePurge}
        title={`Permanently delete ${pendingPurge ? binTypeLabel(pendingPurge.itemType).toLowerCase() : 'item'}`}
        itemLabel={pendingPurge?.name}
        description={
          pendingPurge
            ? `Permanently delete “${pendingPurge.name}”? This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete permanently"
        busy={busy}
      />
      <ConfirmDeleteDialog
        isOpen={emptyOpen}
        onClose={() => setEmptyOpen(false)}
        onConfirm={handleEmpty}
        title="Empty recycle bin"
        description="Permanently delete every item in the recycle bin? This cannot be undone."
        confirmLabel="Empty bin"
        busy={busy}
      />
    </div>
  );
}
