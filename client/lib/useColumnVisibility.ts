"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface ColumnDef {
  id: string;
  label: string;
  /** Shown by default when no saved preference exists. */
  defaultVisible?: boolean;
  /** Cannot be hidden (e.g. primary name column). */
  alwaysVisible?: boolean;
}

function storageKey(tableId: string) {
  return `table_columns_v1:${tableId}`;
}

function loadVisibleIds(tableId: string, columns: ColumnDef[]): Set<string> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const known = new Set(columns.map((c) => c.id));
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && known.has(id)));
  } catch {
    return null;
  }
}

function defaultVisibleIds(columns: ColumnDef[]): Set<string> {
  return new Set(
    columns.filter((c) => c.alwaysVisible || c.defaultVisible !== false).map((c) => c.id)
  );
}

/**
 * Persist show/hide column prefs for admin (or admin-group) table viewers.
 */
export function useColumnVisibility(
  tableId: string,
  columns: ColumnDef[],
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled !== false;
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => defaultVisibleIds(columns));

  useEffect(() => {
    if (!enabled) {
      setVisibleIds(defaultVisibleIds(columns));
      return;
    }
    const saved = loadVisibleIds(tableId, columns);
    setVisibleIds(saved && saved.size > 0 ? saved : defaultVisibleIds(columns));
  }, [tableId, columns, enabled]);

  const persist = useCallback(
    (next: Set<string>) => {
      setVisibleIds(next);
      if (!enabled || typeof window === 'undefined') return;
      try {
        localStorage.setItem(storageKey(tableId), JSON.stringify([...next]));
      } catch {
        // ignore quota / private mode
      }
    },
    [enabled, tableId]
  );

  const isVisible = useCallback(
    (columnId: string) => {
      const col = columns.find((c) => c.id === columnId);
      if (col?.alwaysVisible) return true;
      if (!enabled) return col?.defaultVisible !== false;
      return visibleIds.has(columnId);
    },
    [columns, enabled, visibleIds]
  );

  const toggle = useCallback(
    (columnId: string) => {
      const col = columns.find((c) => c.id === columnId);
      if (!col || col.alwaysVisible || !enabled) return;
      const next = new Set(visibleIds);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      // Keep at least one non-actions column visible.
      const dataVisible = columns.filter(
        (c) => c.id !== 'actions' && (c.alwaysVisible || next.has(c.id))
      );
      if (dataVisible.length === 0) return;
      persist(next);
    },
    [columns, enabled, persist, visibleIds]
  );

  const visibleColumns = useMemo(
    () => columns.filter((c) => isVisible(c.id)),
    [columns, isVisible]
  );

  return { enabled, visibleIds, visibleColumns, isVisible, toggle };
}
