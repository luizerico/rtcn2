"use client";

import React, { useEffect, useId, useRef, useState } from 'react';
import type { ColumnDef } from '@/lib/useColumnVisibility';

interface ColumnVisibilityMenuProps {
  columns: ColumnDef[];
  isVisible: (columnId: string) => boolean;
  toggle: (columnId: string) => void;
}

/**
 * Show/hide table fields — only render when the viewer is admin / admin-group.
 */
export function ColumnVisibilityMenu({ columns, isVisible, toggle }: ColumnVisibilityMenuProps) {
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

  const toggleable = columns.filter((c) => !c.alwaysVisible && c.id !== 'actions');

  if (toggleable.length === 0) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent-soft)]"
      >
        Columns
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
        >
          {toggleable.map((column) => {
            const checked = isVisible(column.id);
            return (
              <label
                key={column.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--accent-soft)]/60"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(column.id)}
                  className="rounded border-[var(--border)]"
                />
                {column.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ColumnVisibilityMenu;
