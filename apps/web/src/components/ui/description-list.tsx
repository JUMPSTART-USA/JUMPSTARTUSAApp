import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Read-only "label + value" facts on detail/profile screens.
 * Replaces the module-local InfoItem / DetailRow / Row variants.
 */
export function DescriptionList({
  className,
  columns = 2,
  ...props
}: HTMLAttributes<HTMLDListElement> & { columns?: 1 | 2 | 3 }) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[columns];
  return <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', cols, className)} {...props} />;
}

/**
 * The micro-label that sits above a value.
 *
 * Shared with `StatTile` by export rather than by copy, because the two strings
 * were already character-for-character identical — InfoItem's `dt` here and the
 * CRM StatTile's `p` — and a divergence would be invisible in review and obvious
 * on screen: two "label above a value" families, one uppercase and one not, on
 * adjacent cards of the same profile.
 *
 * What is deliberately NOT shared is the element. InfoItem emits `dt`/`dd`,
 * valid only inside DescriptionList's `dl`; not one metric render uses a `dl`.
 * Until that seam is resolved these stay two components sharing one label line.
 */
export const fieldLabelClasses = 'text-xs font-medium uppercase tracking-wide text-muted-foreground';

export function InfoItem({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className={fieldLabelClasses}>{label}</dt>
      <dd className="mt-0.5 text-sm">
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
