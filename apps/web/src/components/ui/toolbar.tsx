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
