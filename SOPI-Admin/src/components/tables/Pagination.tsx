import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  label?: string;
}

/** Windowed page numbers with ellipses — `1 … 4 5 6 … 20`. */
function pageWindow(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) pages.push('…');
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < totalPages - 1) pages.push('…');
  pages.push(totalPages);

  return pages;
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
  label = 'results',
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        'flex flex-col-reverse items-center justify-between gap-3 border-t border-ink-200 px-4 py-3 dark:border-ink-800 sm:flex-row',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Showing <span className="font-medium text-ink-700 dark:text-ink-300">{formatNumber(from)}</span>
          –<span className="font-medium text-ink-700 dark:text-ink-300">{formatNumber(to)}</span> of{' '}
          <span className="font-medium text-ink-700 dark:text-ink-300">{formatNumber(total)}</span>{' '}
          {label}
        </p>

        {onPageSizeChange && (
          <label className="hidden items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400 sm:flex">
            Rows
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-7 cursor-pointer rounded-md border border-ink-200 bg-white px-1.5 text-xs text-ink-700 focus:border-brand-500 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-ink-800 dark:hover:text-ink-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageWindow(page, Math.max(1, totalPages)).map((item, index) =>
          item === '…' ? (
            <span key={`gap-${index}`} className="px-1 text-xs text-ink-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? 'page' : undefined}
              className={cn(
                'inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 text-xs font-medium tabular-nums transition-colors',
                item === page
                  ? 'bg-brand-600 text-white'
                  : 'text-ink-600 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800',
              )}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-ink-800 dark:hover:text-ink-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}
