import { Badge, type BadgeProps } from '@/components/ui/badge';
import { humanize } from '@/lib/utils';

const HIRING_VARIANTS: Record<string, BadgeProps['variant']> = {
  prospect: 'secondary',
  partner: 'info',
  actively_hiring: 'success',
  paused: 'warning',
  inactive: 'outline',
};

export function HiringStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={HIRING_VARIANTS[status] ?? 'secondary'}>{humanize(status)}</Badge>;
}

const EMPLOYMENT_VARIANTS: Record<string, BadgeProps['variant']> = {
  applied: 'secondary',
  interviewing: 'info',
  hired: 'success',
  active: 'success',
  terminated: 'destructive',
  resigned: 'warning',
  completed: 'info',
  unknown: 'outline',
};

export function EmploymentStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={EMPLOYMENT_VARIANTS[status] ?? 'secondary'}>{humanize(status)}</Badge>;
}

export const PAY_SUFFIX: Record<string, string> = {
  hourly: '/hr',
  weekly: '/wk',
  annual: '/yr',
};
