import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Paged } from '@/lib/api';

/**
 * Server-driven data table: every list screen uses server-side sorting,
 * filtering and pagination (§3.1). Columns declare their server sort key;
 * the parent owns the query state and refetches.
 */
export interface Column<T> {
  key: string;
  header: string;
  sortKey?: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface ListState {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: Paged<T> | undefined;
  isLoading: boolean;
  state: ListState;
  onStateChange: (next: ListState) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /**
   * Where a row leads. Prefer this over `onRowClick` for any list whose rows
   * open a record: it renders the row's identifying cell as a real <Link>, so a
   * keyboard or screen-reader user gets one tab stop per row with the record's
   * name as the link text — and clicking anywhere in the row still works.
   *
   * `onRowClick` alone leaves rows reachable by pointer only. There was nothing
   * focusable inside them, so keyboard users could not open a participant, a
   * donor, a home or an event from any list at all.
   */
  rowHref?: (row: T) => string;
  /**
   * The dialog-opening counterpart of `rowHref`, for lists whose rows open a
   * panel rather than navigate. Renders the identifying cell as a button, so the
   * accessible name is the row's own text — no per-page label to write and
   * nothing to drift. Pass `undefined` (e.g. from a permission check) and no
   * button renders.
   */
  onRowOpen?: (row: T) => void;
  /** Accessible name for the row link/button, when the cell's text is not identifying. */
  rowLabel?: (row: T) => string;
  /** Column carrying the row link. Defaults to the first — override when that one is a date. */
  linkColumnKey?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  state,
  onStateChange,
  onRowClick,
  emptyMessage = 'No records found',
  rowHref,
  onRowOpen,
  rowLabel,
  linkColumnKey,
}: DataTableProps<T>) {
  const navigate = useNavigate();
  const totalPages = data ? Math.max(1, Math.ceil(data.total / state.pageSize)) : 1;
  const linkKey = linkColumnKey ?? columns[0]?.key;

  /**
   * Row-level pointer navigation, so `rowHref` fully replaces `onRowClick`
   * without taking away click-anywhere. Deliberately ignores modified clicks and
   * clicks that started on a link or button, so cmd-click still opens a new tab
   * and a row's own action buttons are not hijacked.
   */
  const onRowPointer = (row: T) => (e: MouseEvent<HTMLTableRowElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"]')) return;
    navigate(rowHref!(row));
  };

  const toggleSort = (sortKey: string) => {
    if (state.sortBy === sortKey) {
      onStateChange({ ...state, sortDir: state.sortDir === 'asc' ? 'desc' : 'asc', page: 1 });
    } else {
      onStateChange({ ...state, sortBy: sortKey, sortDir: 'asc', page: 1 });
    }
  };

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              const sorted = col.sortKey && state.sortBy === col.sortKey;
              return (
                <TableHead
                  key={col.key}
                  className={col.className}
                  /* Without aria-sort a screen-reader user is told a column is
                     sortable but never which column is sorted, or which way. */
                  aria-sort={
                    !col.sortKey
                      ? undefined
                      : sorted
                        ? state.sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                  }
                >
                  {col.sortKey ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => toggleSort(col.sortKey!)}
                    >
                      {col.header}
                      {sorted ? (
                        state.sortDir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        // Was opacity-40, which measured 1.79:1 — the affordance
                        // telling you a column can be sorted was near-invisible.
                        <ArrowUpDown className="h-3 w-3 opacity-70" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center">
                <Spinner className="mx-auto" />
              </TableCell>
            </TableRow>
          ) : !data || data.items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((row) => (
              <TableRow
                key={row.id}
                className={onRowClick || rowHref || onRowOpen ? 'cursor-pointer' : undefined}
                onClick={
                  rowHref
                    ? onRowPointer(row)
                    : onRowOpen
                      ? () => onRowOpen(row)
                      : onRowClick
                        ? () => onRowClick(row)
                        : undefined
                }
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {rowHref && col.key === linkKey ? (
                      <Link
                        to={rowHref(row)}
                        aria-label={rowLabel?.(row)}
                        className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {col.render(row)}
                      </Link>
                    ) : onRowOpen && col.key === linkKey ? (
                      <button
                        type="button"
                        aria-label={rowLabel?.(row)}
                        // stopPropagation so the row handler does not fire a second time
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowOpen(row);
                        }}
                        className="rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {col.render(row)}
                      </button>
                    ) : (
                      col.render(row)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {data ? `${data.total} record${data.total === 1 ? '' : 's'}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={state.page <= 1}
            aria-label="Previous page"
            onClick={() => onStateChange({ ...state, page: state.page - 1 })}
          >
            <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Prev</span>
          </Button>
          <span className="whitespace-nowrap">
            Page {state.page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={state.page >= totalPages}
            aria-label="Next page"
            onClick={() => onStateChange({ ...state, page: state.page + 1 })}
          >
            <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export const initialListState: ListState = { page: 1, pageSize: 25, sortDir: 'asc' };
