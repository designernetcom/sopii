import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Checkbox } from '@/components/common/Field';
import { Dropdown } from '@/components/common/Dropdown';
import { Button } from '@/components/common/Button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/States';
import { Pagination, type PaginationProps } from './Pagination';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  className?: string;
  headerClassName?: string;
  /** Excluded from the column-visibility menu when false. */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Label used when the row collapses into a card on small screens. */
  mobileLabel?: string;
  /** Hides the cell entirely in the mobile card layout. */
  hideOnMobile?: boolean;
}

export interface SortState {
  by?: string;
  dir?: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;

  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;

  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  emptyIcon?: React.ComponentType<{ className?: string }>;

  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  bulkActions?: (ids: string[], clear: () => void) => ReactNode;

  pagination?: Omit<PaginationProps, 'className'>;
  toolbar?: ReactNode;
  filters?: ReactNode;
  onRowClick?: (row: T) => void;

  /** Custom renderer for the small-screen card layout. */
  mobileCard?: (row: T) => ReactNode;
  columnToggle?: boolean;
  density?: 'comfortable' | 'compact';
  className?: string;
  skeletonRows?: number;
  /** Table id used to remember hidden columns between visits. */
  storageKey?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = 'No records found',
  emptyDescription = 'Try adjusting your search or filters.',
  emptyAction,
  emptyIcon,
  sort,
  onSortChange,
  selectable,
  selected = [],
  onSelectedChange,
  bulkActions,
  pagination,
  toolbar,
  filters,
  onRowClick,
  mobileCard,
  columnToggle = true,
  density = 'comfortable',
  className,
  skeletonRows = 6,
  storageKey,
}: DataTableProps<T>) {
  const [hidden, setHidden] = useState<string[]>(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(`sopii.columns.${storageKey}`);
        if (stored) return JSON.parse(stored) as string[];
      } catch {
        /* ignore */
      }
    }
    return columns.filter((column) => column.defaultHidden).map((column) => column.key);
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`sopii.columns.${storageKey}`, JSON.stringify(hidden));
    } catch {
      /* ignore */
    }
  }, [hidden, storageKey]);

  const visibleColumns = useMemo(
    () => columns.filter((column) => !hidden.includes(column.key)),
    [columns, hidden],
  );

  const pageIds = rows.map(rowKey);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const someSelected = pageIds.some((id) => selected.includes(id)) && !allSelected;

  const toggleAll = () => {
    if (!onSelectedChange) return;
    onSelectedChange(
      allSelected
        ? selected.filter((id) => !pageIds.includes(id))
        : [...new Set([...selected, ...pageIds])],
    );
  };

  const toggleRow = (id: string) => {
    if (!onSelectedChange) return;
    onSelectedChange(
      selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id],
    );
  };

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    const nextDir = sort?.by === key && sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ by: key, dir: nextDir });
  };

  const cellPadding = density === 'compact' ? 'px-4 py-2' : 'px-4 py-3';
  const hasToolbar = Boolean(toolbar || filters || columnToggle);

  return (
    <div className={cn('card overflow-hidden', className)}>
      {hasToolbar && (
        <div className="flex flex-col gap-3 border-b border-ink-200 p-4 dark:border-ink-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
            {columnToggle && columns.some((column) => column.hideable !== false) && (
              <Dropdown
                persistent
                trigger={({ toggle }) => (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={toggle}
                    icon={<Columns3 className="h-3.5 w-3.5" />}
                  >
                    <span className="hidden sm:inline">Columns</span>
                  </Button>
                )}
                panelClassName="w-56 max-h-80 overflow-y-auto"
              >
                <div className="space-y-0.5 p-1">
                  {columns
                    .filter((column) => column.hideable !== false)
                    .map((column) => (
                      <label
                        key={column.key}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-700 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                      >
                        <Checkbox
                          checked={!hidden.includes(column.key)}
                          onChange={() =>
                            setHidden((current) =>
                              current.includes(column.key)
                                ? current.filter((key) => key !== column.key)
                                : [...current, column.key],
                            )
                          }
                        />
                        <span className="truncate">
                          {typeof column.header === 'string' ? column.header : column.key}
                        </span>
                      </label>
                    ))}
                </div>
              </Dropdown>
            )}
          </div>
          {filters}
        </div>
      )}

      {selectable && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-brand-200 bg-brand-50 px-4 py-2.5 dark:border-brand-500/20 dark:bg-brand-500/10">
          <span className="text-xs font-medium text-brand-800 dark:text-brand-200">
            {selected.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions?.(selected, () => onSelectedChange?.([]))}
          </div>
          <button
            type="button"
            onClick={() => onSelectedChange?.([])}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        </div>
      )}

      {error ? (
        <ErrorState onRetry={onRetry} />
      ) : loading ? (
        <TableSkeleton rows={skeletonRows} columns={Math.min(visibleColumns.length + 1, 7)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[45rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/60">
                  {selectable && (
                    <th scope="col" className="w-10 px-4 py-2.5">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={toggleAll}
                        aria-label="Select all rows on this page"
                      />
                    </th>
                  )}
                  {visibleColumns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      style={column.width ? { width: column.width } : undefined}
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400',
                        column.align === 'right'
                          ? 'text-right'
                          : column.align === 'center'
                            ? 'text-center'
                            : 'text-left',
                        column.headerClassName,
                      )}
                    >
                      {column.sortable && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => handleSort(column.key)}
                          className={cn(
                            'inline-flex items-center gap-1 transition-colors hover:text-ink-900 dark:hover:text-ink-100',
                            sort?.by === column.key && 'text-ink-900 dark:text-ink-100',
                            column.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          {column.header}
                          {sort?.by === column.key ? (
                            sort.dir === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                {rows.map((row, index) => {
                  const id = rowKey(row);
                  const isSelected = selected.includes(id);
                  return (
                    <tr
                      key={id}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'transition-colors',
                        onRowClick && 'cursor-pointer',
                        isSelected
                          ? 'bg-brand-50/60 dark:bg-brand-500/5'
                          : 'hover:bg-ink-50 dark:hover:bg-ink-800/40',
                      )}
                    >
                      {selectable && (
                        <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onChange={() => toggleRow(id)}
                            aria-label={`Select row ${index + 1}`}
                          />
                        </td>
                      )}
                      {visibleColumns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            cellPadding,
                            'text-ink-700 dark:text-ink-300',
                            column.align === 'right'
                              ? 'text-right'
                              : column.align === 'center'
                                ? 'text-center'
                                : 'text-left',
                            column.className,
                          )}
                        >
                          {column.render(row, index)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-ink-200 dark:divide-ink-800 md:hidden">
            {rows.map((row, index) => {
              const id = rowKey(row);
              const isSelected = selected.includes(id);

              if (mobileCard) {
                return (
                  <div
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn('p-4', onRowClick && 'cursor-pointer')}
                  >
                    <div className="flex gap-3">
                      {selectable && (
                        <div onClick={(event) => event.stopPropagation()}>
                          <Checkbox checked={isSelected} onChange={() => toggleRow(id)} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">{mobileCard(row)}</div>
                    </div>
                  </div>
                );
              }

              const [primary, ...rest] = visibleColumns;

              return (
                <div
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'flex gap-3 p-4',
                    onRowClick && 'cursor-pointer',
                    isSelected && 'bg-brand-50/60 dark:bg-brand-500/5',
                  )}
                >
                  {selectable && (
                    <div onClick={(event) => event.stopPropagation()}>
                      <Checkbox checked={isSelected} onChange={() => toggleRow(id)} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="min-w-0">{primary?.render(row, index)}</div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {rest
                        .filter((column) => !column.hideOnMobile)
                        .map((column) => (
                          <div key={column.key} className="min-w-0">
                            <dt className="text-2xs uppercase tracking-wide text-ink-400">
                              {column.mobileLabel ??
                                (typeof column.header === 'string' ? column.header : '')}
                            </dt>
                            <dd className="mt-0.5 truncate text-xs text-ink-700 dark:text-ink-300">
                              {column.render(row, index)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pagination && !loading && !error && rows.length > 0 && <Pagination {...pagination} />}
    </div>
  );
}
