"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet } from '@/lib/apiUtils';
import { useAccess } from '@/components/AccessProvider';
import type { CountyRecord } from '@/lib/geoTypes';
import type { PaginatedList } from '@/lib/listTypes';

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** County permission required to appear in results. `null` skips the filter. */
  requiredAction?: 'READ' | 'CREATE' | 'WRITE' | null;
  /** When set, only these county ids are selectable. */
  allowedIds?: string[];
};

export default function CountySearchSelect({
  selectedIds,
  onChange,
  multiple = false,
  disabled = false,
  placeholder = 'Search counties…',
  requiredAction = 'READ',
  allowedIds,
}: Props) {
  const { can } = useAccess();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CountyRecord[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: '25',
          sort: 'name',
          order: 'asc',
        });
        if (query.trim()) params.set('search', query.trim());
        const result = await apiGet<PaginatedList<CountyRecord>>(`/counties?${params.toString()}`);
        if (cancelled) return;
        const allowed = allowedIds ? new Set(allowedIds) : null;
        const readable = (result.items || []).filter((row) => {
          if (allowed && !allowed.has(row._id)) return false;
          if (!requiredAction) return true;
          return can(`COUNTY:${requiredAction}`, { resourceId: row._id });
        });
        setOptions(readable);
        setLabels((prev) => {
          const next = { ...prev };
          for (const row of readable) next[row._id] = row.name;
          return next;
        });
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [allowedIds, can, query, requiredAction]);

  useEffect(() => {
    const missing = selectedIds.filter((id) => id && !labels[id]);
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(
      missing.map((id) =>
        apiGet<CountyRecord>(`/counties/${id}`)
          .then((row) => ({ id, name: row.name }))
          .catch(() => ({ id, name: id }))
      )
    ).then((rows) => {
      if (cancelled) return;
      setLabels((prev) => {
        const next = { ...prev };
        for (const row of rows) next[row.id] = row.name;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [labels, selectedIds]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (!open || disabled) return;

    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [disabled, open]);

  const pick = (id: string) => {
    if (disabled) return;
    if (multiple) {
      onChange(selectedSet.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
    } else {
      onChange([id]);
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={rootRef} className="relative flex min-h-0 flex-1 flex-col gap-2">
      {selectedIds.length ? (
        <ul className="flex max-h-24 shrink-0 flex-wrap gap-2 overflow-y-auto">
          {selectedIds.map((id) => (
            <li
              key={id}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-sm"
            >
              <span>{labels[id] || id}</span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => onChange(selectedIds.filter((value) => value !== id))}
                  className="text-[var(--muted)] hover:text-[var(--danger)]"
                  aria-label={`Remove ${labels[id] || id}`}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <input
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full shrink-0 rounded-md border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
      />
      {open && !disabled ? (
        <ul
          className="relative z-10 h-60 min-h-0 max-h-60 flex-1 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-[var(--muted)]">Searching…</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--muted)]">No counties match.</li>
          ) : (
            options.map((row) => (
              <li key={row._id}>
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    pick(row._id);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)] ${
                    selectedSet.has(row._id) ? 'font-medium text-[var(--accent)]' : ''
                  }`}
                >
                  <span>{row.name}</span>
                  {row.IBGECode ? (
                    <span className="text-xs text-[var(--muted)]">{row.IBGECode}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
