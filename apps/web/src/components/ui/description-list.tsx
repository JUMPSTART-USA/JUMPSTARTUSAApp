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
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
