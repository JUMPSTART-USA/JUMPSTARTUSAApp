import { Search } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Standard list-page toolbar: search + filters left, primary action right
 * (via ToolbarSpacer). Wraps cleanly on small screens.
 *
 *   <ListToolbar>
 *     <SearchInput value={q} onChange={(e) => setQ(e.target.value)} />
 *     <Select className="w-full sm:w-44">…</Select>
 *     <ToolbarSpacer />
 *     <Button><Plus /> New thing</Button>
 *   </ListToolbar>
 */
export function ListToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)} {...props} />;
}

export function ToolbarSpacer() {
  return <div className="hidden flex-1 sm:block" />;
}

/** Debounce the value in the parent (useDebounced from @/lib/form). */
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input ref={ref} type="search" className="pl-8" {...props} />
    </div>
  ),
);
SearchInput.displayName = 'SearchInput';

/**
 * Labeled date filter for toolbars. iOS/iPadOS render empty date inputs as
 * blank controls (no mm/dd/yyyy ghost), so when empty we hide the native
 * text (avoids doubling on engines that do show one) and overlay our own
 * hint. Controlled only — pass `value`. Pair with
 * `<ListToolbar className="items-end">` so unlabeled controls align.
 */
export const ToolbarDateField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string }
>(({ label, className, value, ...props }, ref) => {
  const empty = value === '' || value === undefined || value === null;
  return (
    <label className={cn('flex w-full flex-col gap-1 sm:w-40', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="relative block">
        <Input
          ref={ref}
          type="date"
          value={value}
          className={cn('peer', empty && '[&:not(:focus)]:text-transparent')}
          {...props}
        />
        {empty ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3 hidden items-center text-sm text-muted-foreground peer-[:not(:focus)]:flex"
          >
            mm/dd/yyyy
          </span>
        ) : null}
      </span>
    </label>
  );
});
ToolbarDateField.displayName = 'ToolbarDateField';
