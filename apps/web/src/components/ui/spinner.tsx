import { Loader2, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
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

/**
 * `action` is the whole point of the audit's empty-state finding: 72 of these
 * told a user that nothing was here and then left them to work out what to do
 * about it. An empty screen is a fork in the road — either nothing exists yet
 * (make one) or a filter excluded everything (clear it) — and the state that
 * knows which should say so.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * "You may not see this" — deliberately NOT an `EmptyState`.
 *
 * The two say opposite things and were rendering identically. Nine screens
 * reported a permission denial through `EmptyState`, so "No access to case
 * management" arrived in the same dashed box, the same weight and the same grey
 * as "No case notes recorded." In an app holding records about justice-involved
 * people that is the worse of the two possible confusions: a case manager
 * reading the denial as an empty file concludes the participant has no history,
 * and acts on it.
 *
 * So this looks like a wall, not a gap — a solid border rather than a dashed
 * one, a filled surface rather than the page's own, and a lock. Keep those three
 * differences; each one on its own is too quiet to carry the distinction.
 *
 * `reason` should say what would grant access, because the reader's next move is
 * to ask someone for it. Naming a permission is not a leak: it describes this
 * user's own role, not whether any record exists.
 */
export function NoAccess({
  title = 'No access',
  reason,
  className,
}: {
  title?: string;
  reason?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-lg border bg-muted/40 px-6 py-12 text-center',
        className,
      )}
    >
      <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      {reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
    </div>
  );
}

/**
 * A value that EXISTS and this reader is not cleared to see — not a value that
 * is missing.
 *
 * It renders an em dash like a hundred other cells, and that is the trap: swept
 * into a shared "empty value" dash by a mechanical pass, a redacted DOC number
 * becomes indistinguishable from a participant who has none. The lock and the
 * tooltip are what carry the difference, so a named component exists for one
 * call site — the name is the point, so the next sweep has something to stop at.
 *
 * Only for fields the API STRIPS while keeping the row. Where it omits the field
 * entirely (`sexOffenderRegistry`) or the whole record (`offenses`), the right
 * answer is to render nothing at all — see the §7.2 notes in OverviewTab.
 */
export function RedactedValue({ requires }: { requires: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-muted-foreground"
      title={`Hidden — requires ${requires}`}
    >
      <Lock className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">Hidden — requires {requires}</span>
      <span aria-hidden="true">—</span>
    </span>
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
