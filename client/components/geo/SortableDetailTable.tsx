"use client";

import { useMemo, useState } from 'react';
import TableOptionsMenu from '@/components/ui/ColumnVisibilityMenu';
import { useColumnVisibility } from '@/lib/useColumnVisibility';

export type SortableColumn<T> = {
  id: string;
  label: string;
  type?: 'number' | 'text' | 'date';
  getValue: (row: T) => number | string | null | undefined;
  format?: (row: T) => string;
  className?: string;
  defaultVisible?: boolean;
};

function compareValues(
  left: number | string | null | undefined,
  right: number | string | null | undefined,
  type: SortableColumn<unknown>['type'],
  order: 'asc' | 'desc'
): number {
  const emptyLeft = left == null || left === '';
  const emptyRight = right == null || right === '';
  if (emptyLeft && emptyRight) return 0;
  if (emptyLeft) return 1;
  if (emptyRight) return -1;

  let result = 0;
  if (type === 'number' && typeof left === 'number' && typeof right === 'number') {
    result = left - right;
  } else if (type === 'date') {
    result = new Date(String(left)).getTime() - new Date(String(right)).getTime();
  } else {
    result = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
  }
  return order === 'asc' ? result : -result;
}

export default function SortableDetailTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  defaultSort,
  defaultOrder = 'desc',
  tableId,
}: {
  rows: T[];
  columns: Array<SortableColumn<T>>;
  rowKey: (row: T, index: number) => string;
  empty: string;
  defaultSort: string;
  defaultOrder?: 'asc' | 'desc';
  tableId?: string;
}) {
  const [sort, setSort] = useState(defaultSort);
  const [order, setOrder] = useState<'asc' | 'desc'>(defaultOrder);
  const columnDefs = useMemo(
    () => columns.map((column) => ({ id: column.id, label: column.label, defaultVisible: column.defaultVisible })),
    [columns]
  );
  const { isVisible, toggle } = useColumnVisibility(tableId || 'geo-detail', columnDefs, {
    enabled: Boolean(tableId),
  });
  const visibleColumns = useMemo(
    () => (tableId ? columns.filter((column) => isVisible(column.id)) : columns),
    [columns, isVisible, tableId]
  );
  const active = visibleColumns.find((column) => column.id === sort) || visibleColumns[0];

  const sorted = useMemo(() => {
    if (!active) return rows;
    return [...rows].sort((left, right) =>
      compareValues(active.getValue(left), active.getValue(right), active.type, order)
    );
  }, [rows, active, order]);

  const toggleSort = (column: SortableColumn<T>) => {
    if (sort === column.id) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(column.id);
    setOrder(column.type === 'text' ? 'asc' : 'desc');
  };

  if (!rows.length) {
    return <p className="p-4 text-sm text-[var(--muted)]">{empty}</p>;
  }

  return (
    <div>
      {tableId ? (
        <div className="flex justify-end border-b border-[var(--border)] px-4 py-2">
          <TableOptionsMenu columns={columnDefs} isVisible={isVisible} toggle={toggle} />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="headers-nowrap min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 text-[var(--muted)]">
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.id} className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort(column)}
                    className="hover:text-[var(--accent)]"
                  >
                    {column.label}
                    {active?.id === column.id ? (order === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, index) => (
              <tr key={rowKey(row, index)} className="border-b border-[var(--border)] last:border-0">
                {visibleColumns.map((column) => (
                  <td key={column.id} className={`px-4 py-2 ${column.className || ''}`}>
                    {column.format ? column.format(row) : String(column.getValue(row) ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
