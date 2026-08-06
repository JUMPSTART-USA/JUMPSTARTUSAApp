import {
  HOURS_SOURCE_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  SHIFT_SIGNUP_STATUS_LABELS,
  type HoursSource,
  type OpportunityStatus,
  type ShiftSignupStatus,
} from '@jumpstart/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
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

// ── Volunteer engagement badges & formatters ────────────────────────────────

const OPPORTUNITY_VARIANTS: Record<OpportunityStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  open: 'success',
  closed: 'outline',
  archived: 'outline',
};

export function OpportunityStatusBadge({ status }: { status: OpportunityStatus }) {
  return <Badge variant={OPPORTUNITY_VARIANTS[status]}>{OPPORTUNITY_STATUS_LABELS[status]}</Badge>;
}

const SIGNUP_VARIANTS: Record<ShiftSignupStatus, BadgeProps['variant']> = {
  signed_up: 'secondary',
  confirmed: 'info',
  attended: 'success',
  no_show: 'destructive',
  canceled: 'outline',
  waitlisted: 'warning',
};

export function SignupStatusBadge({ status }: { status: ShiftSignupStatus }) {
  return <Badge variant={SIGNUP_VARIANTS[status]}>{SHIFT_SIGNUP_STATUS_LABELS[status]}</Badge>;
}

export function HoursSourceBadge({ source }: { source: HoursSource }) {
  return <Badge variant="outline">{HOURS_SOURCE_LABELS[source]}</Badge>;
}

/** Decimal hours (string or number) → compact display: 2 → "2", 2.5 → "2.5". */
export function formatHours(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toFixed(2).replace(/0$/, '');
}

/** 24-hour "HH:MM" (shift times) → "h:MM AM/PM". */
export function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '—';
  const [hStr = '', mStr = ''] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!hStr || !mStr || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}
