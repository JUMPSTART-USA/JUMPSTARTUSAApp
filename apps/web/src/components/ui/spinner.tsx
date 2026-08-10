import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} />;
}

/**
 * role="status" with visually hidden text: a spinning icon says nothing to a
 * screen reader, so 91 loading states used to pass in silence.
 */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * A failed screen used to be a dead red box: the only escape was a browser
 * reload, which on a list screen also discards every filter the user had set.
 * Pass `onRetry` (a query's `refetch`) to offer a real way out.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <Notice variant="error">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>{message}</span>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </span>
    </Notice>
  );
}
