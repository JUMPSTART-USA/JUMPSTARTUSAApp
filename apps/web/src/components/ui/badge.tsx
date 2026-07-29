import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn, humanize } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-muted-foreground',
        gold: 'border-transparent bg-gold/20 text-foreground',
        success: 'border-success/20 bg-success/10 text-success',
        warning: 'border-warning/20 bg-warning/10 text-warning',
        destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
        info: 'border-info/20 bg-info/10 text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Maps common status enum values to a badge color so screens stay consistent. */
const STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  active: 'success',
  completed: 'info',
  enrolled: 'secondary',
  planned: 'secondary',
  assessment_pending: 'warning',
  left_early: 'warning',
  removed: 'destructive',
  transferred: 'info',
  canceled: 'destructive',
  pending: 'warning',
  in_review: 'warning',
  approved: 'success',
  rejected: 'destructive',
  spam: 'destructive',
  applicant: 'secondary',
  inactive: 'outline',
  suspended: 'destructive',
  deactivated: 'destructive',
  invited: 'warning',
  clear: 'success',
  review: 'warning',
  not_cleared: 'destructive',
  satisfied: 'success',
  expired: 'destructive',
  open: 'secondary',
  in_progress: 'warning',
  // support tickets
  resolved: 'success',
  closed: 'outline',
  paused: 'warning',
  ended: 'outline',
  proposed: 'secondary',
  alumni: 'info',
  alumni_engaged: 'success',
  // Blue/Green/Yellow/Red assessments
  blue: 'info',
  green: 'success',
  yellow: 'warning',
  red: 'destructive',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'}>{humanize(status)}</Badge>;
}
