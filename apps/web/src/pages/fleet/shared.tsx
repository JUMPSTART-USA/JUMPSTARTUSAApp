import { Badge, type BadgeProps } from '@/components/ui/badge';
import { humanize } from '@/lib/utils';
import type { AlertSeverity, Vehicle } from './types';

export function vehicleLabel(v: Pick<Vehicle, 'year' | 'make' | 'model'>): string {
  return `${v.year} ${v.make} ${v.model}`;
}

const SEVERITY_VARIANTS: Record<AlertSeverity, BadgeProps['variant']> = {
  overdue: 'destructive',
  due_soon: 'warning',
  upcoming: 'secondary',
};

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <Badge variant={SEVERITY_VARIANTS[severity]}>{humanize(severity)}</Badge>;
}
