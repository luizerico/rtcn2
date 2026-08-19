"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { TableActionIcon } from '@/components/ui/TableActionIcon';

export type RowActionItem = {
  id: string;
  label: string;
  allowed: boolean;
  reason?: string;
  danger?: boolean;
  href?: string;
  disabled?: boolean;
  onSelect?: () => void;
};

function itemClass(danger: boolean, disabled: boolean) {
  if (disabled) return 'cursor-not-allowed text-[var(--muted)] opacity-50';
  if (danger) return 'text-[var(--danger)] hover:bg-red-50';
  return 'text-[var(--foreground)] hover:bg-[var(--accent-soft)]/60';
}

/**
 * Compact overflow menu for table row actions. Portaled so it is not clipped by table overflow.
 */
export function RowActionsMenu({
  items,
  label = 'More actions',
}: {
  items: RowActionItem[];
  label?: string;
}) {
  const visible = items.filter((item) => item.allowed);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 192;
    const estimatedHeight = Math.min(visible.length * 36 + 8, 280);
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    const openUp = window.innerHeight - rect.bottom < estimatedHeight + 8 && rect.top > estimatedHeight;
    const top = openUp ? rect.top - estimatedHeight - 4 : rect.bottom + 4;
    setCoords({ top, left });
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onReposition = () => setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  if (!visible.length) return null;

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          style={{ top: coords.top, left: coords.left }}
          className="fixed z-40 min-w-[12rem] rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
        >
          {visible.map((item) => {
            const className = `block w-full px-3 py-1.5 text-left text-sm ${itemClass(
              Boolean(item.danger),
              Boolean(item.disabled)
            )}`;
            const title = item.disabled ? item.reason || item.label : item.label;
            if (item.href && !item.disabled) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  role="menuitem"
                  className={className}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={title}
                className={className}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect?.();
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={label}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--accent)] transition hover:bg-[var(--accent-soft)]/60"
      >
        <TableActionIcon name="more" />
      </button>
      {menu}
    </>
  );
}

export default RowActionsMenu;
