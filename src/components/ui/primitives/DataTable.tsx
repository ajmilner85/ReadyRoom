import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Checkbox } from './Controls';
import { Icon } from './Icon';

export type SortDir = 'asc' | 'desc';
export interface SortState { key: string; dir: SortDir }

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Fixed px width; omit for flex:1. */
  width?: number;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  /** Value used for sorting (defaults to row[key]). */
  sortValue?: (row: T) => string | number | null | undefined;
  render: (row: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

export interface TableGroup<T> {
  id: string;
  header: React.ReactNode;
  rows: T[];
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  /** Flat rows, or use `groups` for sticky group headers. */
  rows?: T[];
  groups?: TableGroup<T>[];
  rowKey: (row: T) => string;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  sort?: SortState | null;
  onSortChange?: (s: SortState) => void;
  onRowClick?: (row: T) => void;
  activeRowKey?: string | null;
  rowClassName?: (row: T) => string | undefined;
  empty?: React.ReactNode;
  /** Wrap in a bordered frame (default true). */
  framed?: boolean;
  className?: string;
  /** Min width before horizontal scroll kicks in. */
  minWidth?: number;
  dense?: boolean;
}

function compare(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') return na - nb;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

/** Sort rows by a column (stable). */
export function sortRows<T>(rows: T[], columns: Column<T>[], sort?: SortState | null): T[] {
  if (!sort) return rows;
  const col = columns.find(c => c.key === sort.key);
  if (!col) return rows;
  const get = col.sortValue ?? ((r: T) => (r as Record<string, unknown>)[col.key] as string);
  const out = rows.map((r, i) => ({ r, i }));
  out.sort((x, y) => compare(get(x.r), get(y.r)) * (sort.dir === 'asc' ? 1 : -1) || x.i - y.i);
  return out.map(o => o.r);
}

/** Table with bulk select, sortable headers (accent caret), optional sticky group headers. */
export function DataTable<T>({
  columns, rows, groups, rowKey, selectable, selected = [], onSelectedChange, sort: sortProp, onSortChange,
  onRowClick, activeRowKey, rowClassName, empty, framed = true, className, minWidth, dense,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<SortState | null>(null);
  const sort = sortProp !== undefined ? sortProp : internalSort;
  const setSort = (s: SortState) => (onSortChange ? onSortChange(s) : setInternalSort(s));

  const allGroups = useMemo<TableGroup<T>[]>(
    () => (groups ?? [{ id: '__all', header: null, rows: rows ?? [] }]).map(g => ({ ...g, rows: sortRows(g.rows, columns, sort) })),
    [groups, rows, columns, sort],
  );
  const allIds = useMemo(() => allGroups.flatMap(g => g.rows.map(rowKey)), [allGroups, rowKey]);
  const selSet = useMemo(() => new Set(selected), [selected]);
  const allSel = allIds.length > 0 && allIds.every(id => selSet.has(id));
  const someSel = !allSel && allIds.some(id => selSet.has(id));

  const setIds = (ids: string[], on: boolean) => {
    const next = new Set(selSet);
    ids.forEach(id => (on ? next.add(id) : next.delete(id)));
    onSelectedChange?.(Array.from(next));
  };

  const cell = (c: Column<T>) => ({
    width: c.width, minWidth: c.minWidth ?? c.width, flex: c.width ? 'none' : 1,
    textAlign: c.align ?? 'left',
    justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start',
  } as React.CSSProperties);

  const header = (
    <div className="sticky top-0 z-[3] flex items-center gap-3 px-3 py-2 bg-panel2 border-b border-border font-mono text-[9.5px] tracking-[.1em] text-text2 uppercase">
      {selectable ? <Checkbox size={16} checked={allSel} indeterminate={someSel} onChange={v => setIds(allIds, v)} /> : null}
      {columns.map(c => {
        const active = sort?.key === c.key;
        return (
          <div
            key={c.key}
            className={clsx('flex items-center gap-1 min-w-0', c.sortable && 'cursor-pointer select-none hover:text-text', active && 'text-accent', c.hideOnMobile && 'max-[760px]:hidden')}
            style={cell(c)}
            onClick={() => c.sortable && setSort({ key: c.key, dir: active && sort?.dir === 'asc' ? 'desc' : 'asc' })}
          >
            <span className="truncate">{c.header}</span>
            {c.sortable ? (
              <span className={clsx('flex transition-transform duration-200', !active && 'opacity-0')} style={{ transform: active && sort?.dir === 'desc' ? 'rotate(180deg)' : 'none' }}>
                <Icon name="chevronUp" size={11} stroke={2.2} />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const totalRows = allGroups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className={clsx(framed && 'border border-border rounded-rr-lg overflow-hidden', 'flex flex-col min-h-0', className)}>
      <div className="flex-1 min-h-0 overflow-auto">
        <div style={{ minWidth }}>
          {header}
          {totalRows === 0 && empty ? <div>{empty}</div> : null}
          {allGroups.map(g => {
            const gIds = g.rows.map(rowKey);
            const gAll = gIds.length > 0 && gIds.every(id => selSet.has(id));
            const gSome = !gAll && gIds.some(id => selSet.has(id));
            return (
              <React.Fragment key={g.id}>
                {g.header !== null ? (
                  <div className="sticky top-[33px] z-[2] flex items-center gap-3 px-3 py-[7px] bg-panel border-b border-border">
                    {selectable ? <Checkbox size={16} checked={gAll} indeterminate={gSome} onChange={v => setIds(gIds, v)} /> : null}
                    <div className="flex items-center gap-2 min-w-0 flex-1">{g.header}</div>
                  </div>
                ) : null}
                {g.rows.map(r => {
                  const id = rowKey(r);
                  const isSel = selSet.has(id);
                  const isActive = activeRowKey === id;
                  return (
                    <div
                      key={id}
                      onClick={() => onRowClick?.(r)}
                      className={clsx(
                        'flex items-center gap-3 px-3 border-b border-border transition-colors duration-150',
                        dense ? 'py-[6px]' : 'py-[9px]',
                        onRowClick && 'cursor-pointer',
                        isActive ? 'bg-accent-weak' : isSel ? 'bg-panel2' : 'hover:bg-panel2',
                        rowClassName?.(r),
                      )}
                      style={isActive ? { boxShadow: 'inset 3px 0 0 var(--rr-accent)' } : undefined}
                    >
                      {selectable ? <Checkbox size={16} checked={isSel} onChange={v => setIds([id], v)} /> : null}
                      {columns.map(c => (
                        <div key={c.key} className={clsx('flex items-center min-w-0', c.className, c.hideOnMobile && 'max-[760px]:hidden')} style={cell(c)}>
                          {c.render(r)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Bulk action bar shown when rows are selected. */
export const BulkBar: React.FC<{ count: number; onClear: () => void; children: React.ReactNode; className?: string }> = ({ count, onClear, children, className }) => {
  if (!count) return null;
  return (
    <div
      className={clsx('flex items-center gap-2 flex-wrap px-3 py-2 rounded-rr-lg border bg-accent-weak', className)}
      style={{ borderColor: 'var(--rr-accent)', animation: 'rrPopIn .16s ease' }}
    >
      <span className="text-[12.5px] font-semibold text-accent mr-1">{count} selected</span>
      {children}
      <div className="flex-1" />
      <button type="button" onClick={onClear} className="text-[12px] font-semibold text-text2 hover:text-bad bg-transparent border-0 cursor-pointer">
        Clear
      </button>
    </div>
  );
};
