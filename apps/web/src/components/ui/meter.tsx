import { cn } from '@/lib/utils';

/**
 * The track and the fill of a horizontal bar. Nothing else — and deliberately
 * NOT the rule for what colour the fill is.
 *
 * Two bars in this app draw the same geometry and mean opposite things by a full
 * one: a fundraising ProgressBar at 100% has hit its goal and paints success; an
 * OccupancyBar at 100% has filled the last bed in a transitional home and paints
 * warning, with over-capacity in destructive. Sharing the geometry is safe.
 * Sharing a threshold rule is how an over-capacity home turns green.
 *
 * So `tone` is a required prop with no default. There is no `value >= 100`
 * anywhere in this file, and adding one would have to be wrong for one of the
 * two callers.
 */
export type MeterTone = 'primary' | 'success' | 'warning' | 'destructive';

const TONE_FILL: Record<MeterTone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};

export function Meter({
  /** 0–100. Clamped here so a caller cannot overflow the track. */
  pct,
  tone,
  className,
}: {
  pct: number;
  tone: MeterTone;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-all', TONE_FILL[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
