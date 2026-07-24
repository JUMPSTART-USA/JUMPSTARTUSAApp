import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
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
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  state,
  onStateChange,
  onRowClick,
  emptyMessage = 'No records found',
}: DataTableProps<T>) {
  const totalPages = data ? Math.max(1, Math.ceil(data.total / state.pageSize)) : 1;

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
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.sortKey ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort(col.sortKey!)}
                  >
                    {col.header}
                    {state.sortBy === col.sortKey ? (
                      state.sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
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
                className={onRowClick ? 'cursor-pointer' : undefined}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data ? `${data.total} record${data.total === 1 ? '' : 's'}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={state.page <= 1}
            onClick={() => onStateChange({ ...state, page: state.page - 1 })}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span>
            Page {state.page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={state.page >= totalPages}
            onClick={() => onStateChange({ ...state, page: state.page + 1 })}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export const initialListState: ListState = { page: 1, pageSize: 25, sortDir: 'asc' };
