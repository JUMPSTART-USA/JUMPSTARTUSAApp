import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Table({
  className,
  onScrolledChange,
  ...props
}: HTMLAttributes<HTMLTableElement> & {
  /** Fires when the horizontal scroll leaves, or returns to, the left edge. */
  onScrolledChange?: (scrolled: boolean) => void;
}) {
  return (
    <div
      className="w-full overflow-x-auto rounded-lg border bg-card shadow-card"
      onScroll={
        onScrolledChange
          ? (e) => onScrolledChange((e.target as HTMLDivElement).scrollLeft > 0)
          : undefined
      }
    >
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-muted/40 [&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

/**
 * The background is set HERE, not left transparent, because the identifying cell
 * is sticky and inherits it — a transparent pinned cell has the rest of the row
 * sliding visibly through it.
 */
export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b bg-card transition-colors hover:bg-accent/40', className)}
      {...props}
    />
  );
}

/**
 * `scope="col"` by default: without it a screen reader has to guess which header
 * describes a cell, and in a 10-column donor table it guesses badly. Callers can
 * still override scope for a row header.
 */
export function TableHead({ className, scope, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope ?? 'col'}
      className={cn(
        'h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
}
