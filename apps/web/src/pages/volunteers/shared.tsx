import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Expiry rendering used across trainings, clearances and checks: red once
 * lapsed, amber inside the warning window, plain date otherwise.
 */
export function ExpiryBadge({
  date,
  warnDays = 60,
  emptyLabel = 'Never expires',
}: {
  date: string | null | undefined;
  warnDays?: number;
  emptyLabel?: string;
}) {
  if (!date) return <span className="text-muted-foreground">{emptyLabel}</span>;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return <span className="text-muted-foreground">—</span>;
  const now = Date.now();
  if (d.getTime() < now) return <Badge variant="destructive">Expired {formatDate(date)}</Badge>;
  if (d.getTime() - now <= warnDays * DAY_MS)
    return <Badge variant="warning">Expires {formatDate(date)}</Badge>;
  return <span>{formatDate(date)}</span>;
}
