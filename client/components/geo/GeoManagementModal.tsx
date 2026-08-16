"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/lib/apiUtils';
import { useToast } from '@/components/ToastProvider';
import { Modal } from '@/components/ui/Modal';
import { AccessPrimaryButton } from '@/components/ui/AccessControls';

interface SyncSourceStatus {
  source: string;
  label: string;
  description: string;
  status: string;
  upToDate: boolean;
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  originPeriod: string;
  originUpdatedAt?: string | null;
  rowCount: number;
  lastError: string;
}

interface GeoManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function statusLabel(item: SyncSourceStatus): string {
  if (item.status === 'syncing') return 'Syncing';
  if (item.status === 'failed') return 'Failed';
  if (!item.lastSuccessAt) return 'Never synced';
  if (item.upToDate) return 'Up to date';
  return 'New data available';
}

function formatWhen(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function completionMessage(item: SyncSourceStatus): { tone: 'success' | 'warning' | 'error'; message: string } {
  if (item.status === 'failed') {
    return { tone: 'error', message: item.lastError || 'Sync failed.' };
  }
  if (item.status === 'up_to_date') {
    return {
      tone: 'success',
      message: item.rowCount
        ? `Up to date · ${item.rowCount.toLocaleString()} rows.`
        : 'Origin has not published newer data since the last sync.',
    };
  }
  return {
    tone: item.lastError ? 'warning' : 'success',
    message: item.lastError
      ? `Updated ${item.rowCount.toLocaleString()} rows; some requests failed.`
      : `Updated ${item.rowCount.toLocaleString()} rows.`,
  };
}

export default function GeoManagementModal({ isOpen, onClose }: GeoManagementModalProps) {
  const { pushToast } = useToast();
  const [items, setItems] = useState<SyncSourceStatus[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingBySource, setPendingBySource] = useState<Record<string, boolean>>({});
  const [forceBySource, setForceBySource] = useState<Record<string, boolean>>({});
  const prevStatusRef = useRef<Record<string, string>>({});

  const loadStatus = useCallback(async ({ probe = true }: { probe?: boolean } = {}) => {
    const result = await apiGet<{ items: SyncSourceStatus[] }>(
      probe ? '/geo/sync/status' : '/geo/sync/status?probe=0'
    );
    const next = result.items || [];
    for (const item of next) {
      const previous = prevStatusRef.current[item.source];
      if (previous === 'syncing' && item.status !== 'syncing') {
        const completion = completionMessage(item);
        pushToast({
          tone: completion.tone,
          title: item.label,
          message: completion.message,
        });
      }
      prevStatusRef.current[item.source] = item.status;
    }
    setItems(next);
    setPendingBySource((prev) => {
      const nextPending = { ...prev };
      for (const item of next) {
        if (item.status !== 'syncing') delete nextPending[item.source];
      }
      return nextPending;
    });
    return next;
  }, [pushToast]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setLoadError(null);
    void loadStatus({ probe: false })
      .catch((err) => {
        setItems([]);
        setLoadError(err instanceof Error ? err.message : 'Could not load sync status.');
      })
      .finally(() => setLoading(false));
  }, [isOpen, loadStatus]);

  const anySyncing =
    items.some((item) => item.status === 'syncing') || Object.values(pendingBySource).some(Boolean);

  useEffect(() => {
    if (!anySyncing) return;
    const timer = window.setInterval(() => {
      void loadStatus({ probe: false }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [anySyncing, loadStatus]);

  const onSync = async (source: string) => {
    const label = items.find((item) => item.source === source)?.label || source;
    const force = Boolean(forceBySource[source]);
    prevStatusRef.current[source] = 'syncing';
    setPendingBySource((prev) => ({ ...prev, [source]: true }));
    setItems((prev) =>
      prev.map((item) => (item.source === source ? { ...item, status: 'syncing', lastError: '' } : item))
    );
    try {
      await apiPost('/geo/sync', { source, force });
      pushToast({
        tone: 'success',
        title: label,
        message: 'Sync started in the background. You can keep using the app.',
      });
      await loadStatus({ probe: false });
    } catch (err) {
      prevStatusRef.current[source] = 'failed';
      setPendingBySource((prev) => {
        const next = { ...prev };
        delete next[source];
        return next;
      });
      pushToast({
        tone: 'error',
        title: 'Sync failed',
        message: err instanceof Error ? err.message : 'Could not start this sync.',
      });
      await loadStatus({ probe: false }).catch(() => undefined);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Geography management" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">
          Each source syncs independently in the background. Close this window anytime; a toast reports
          when a sync finishes. Use Force to re-download the current window.
        </p>

        {loadError ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {loadError}
          </p>
        ) : null}
        {loading ? <p className="text-sm text-[var(--muted)]">Loading source status…</p> : null}

        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {items.map((item) => {
            const thisSyncing = item.status === 'syncing' || Boolean(pendingBySource[item.source]);
            return (
              <div key={item.source} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">{item.description}</p>
                  <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
                    {statusLabel(item)}
                    {item.originPeriod ? ` · origin ${item.originPeriod}` : ''}
                    {` · last sync ${formatWhen(item.lastSuccessAt)}`}
                    {item.rowCount ? ` · ${item.rowCount.toLocaleString()} rows` : ''}
                  </p>
                  {item.lastError && item.status !== 'syncing' ? (
                    <p className="mt-1 text-xs text-[var(--danger)]">{item.lastError}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={Boolean(forceBySource[item.source])}
                      disabled={thisSyncing}
                      onChange={(event) =>
                        setForceBySource((prev) => ({ ...prev, [item.source]: event.target.checked }))
                      }
                    />
                    Force
                  </label>
                  <AccessPrimaryButton
                    allowed
                    disabled={thisSyncing}
                    onClick={() => void onSync(item.source)}
                  >
                    {thisSyncing ? 'Syncing…' : 'Sync'}
                  </AccessPrimaryButton>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
