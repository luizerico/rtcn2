"use client";

import React, { useEffect, useId, useRef, useState } from 'react';
import type { ColumnDef } from '@/lib/useColumnVisibility';

export interface TableOptionsMenuProps {
  columns?: ColumnDef[];
  isVisible?: (columnId: string) => boolean;
  toggle?: (columnId: string) => void;
  showFilters?: boolean;
  onToggleFilters?: () => void;
}

function HamburgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/**
 * Compact table header control: show/hide filters and column visibility.
 */
export function TableOptionsMenu({
  columns = [],
  isVisible,
  toggle,
  showFilters,
  onToggleFilters,
}: TableOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleable =
    isVisible && toggle
      ? columns.filter((c) => !c.alwaysVisible && c.id !== 'actions')
      : [];
  const hasFilters = typeof onToggleFilters === 'function';
  const hasColumns = toggleable.length > 0;

  if (!hasFilters && !hasColumns) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Table options"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent-soft)]/40"
      >
        <HamburgerIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
        >
          {hasFilters ? (
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--accent-soft)]/60">
              <input
                type="checkbox"
                checked={Boolean(showFilters)}
                onChange={onToggleFilters}
                className="rounded border-[var(--border)]"
              />
              Show filters
            </label>
          ) : null}
          {hasFilters && hasColumns ? (
            <div className="my-1 border-t border-[var(--border)]" role="separator" />
          ) : null}
          {hasColumns ? (
            <>
              <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Columns
              </p>
              {toggleable.map((column) => {
                const checked = isVisible?.(column.id) ?? false;
                return (
                  <label
                    key={column.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--accent-soft)]/60"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle?.(column.id)}
                      className="rounded border-[var(--border)]"
                    />
                    {column.label}
                  </label>
                );
              })}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** @deprecated Use TableOptionsMenu */
export function ColumnVisibilityMenu(props: TableOptionsMenuProps) {
  return <TableOptionsMenu {...props} />;
}

export default TableOptionsMenu;
