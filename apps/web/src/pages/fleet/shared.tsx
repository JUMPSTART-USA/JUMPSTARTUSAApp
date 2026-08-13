import { Badge, type BadgeProps } from '@/components/ui/badge';
import { humanize } from '@/lib/utils';
import type { AlertSeverity, Vehicle } from './types';

export function vehicleLabel(v: Pick<Vehicle, 'year' | 'make' | 'model'>): string {
  return `${v.year} ${v.make} ${v.model}`;
}

/**
 * Kept out of the kit's STATUS_VARIANTS because `overdue` is ours here: an
 * overdue inspection is a vehicle we are still driving past its service date,
 * so it reads destructive. A recurring gift is `overdue` when the donor's card
 * did not run, which is nobody on staff being late, and the CRM spells it
 * warning. One global ruling would have to be wrong for one of them.
 */
const SEVERITY_VARIANTS: Record<AlertSeverity, BadgeProps['variant']> = {
  overdue: 'destructive',
  due_soon: 'warning',
  upcoming: 'secondary',
};

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <Badge variant={SEVERITY_VARIANTS[severity]}>{humanize(severity)}</Badge>;
}
