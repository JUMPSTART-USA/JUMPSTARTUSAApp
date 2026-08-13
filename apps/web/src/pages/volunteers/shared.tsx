import {
  HOURS_SOURCE_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  SHIFT_SIGNUP_STATUS_LABELS,
  type HoursSource,
  type OpportunityStatus,
  type ShiftSignupStatus,
} from '@jumpstart/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { compareToToday, todayInput } from '@/lib/form';
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
  // Expiry dates are date-only, so both sides of the comparison must be read on
  // the local calendar. `new Date('2026-08-10')` is UTC midnight, which put the
  // "expired" boundary at 8pm Eastern the day before and flipped these badges a
  // day early. compareToToday works on 'yyyy-MM-dd' strings and has no timezone.
  const elapsed = compareToToday(date);
  if (Number.isNaN(elapsed)) return <span className="text-muted-foreground">—</span>;
  if (elapsed < 0) return <Badge variant="destructive">Expired {formatDate(date)}</Badge>;
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return <span className="text-muted-foreground">—</span>;
  const startOfToday = new Date(`${todayInput()}T00:00:00`).getTime();
  if (d.getTime() - startOfToday <= warnDays * DAY_MS)
    return <Badge variant="warning">Expires {formatDate(date)}</Badge>;
  return <span>{formatDate(date)}</span>;
}

// ── Volunteer engagement badges & formatters ────────────────────────────────

/**
 * Kept out of the kit's STATUS_VARIANTS: `open` is the healthy state here — the
 * opportunity is published and taking signups, and it is the only green thing
 * on that list — where the canonical map rules `open` the neutral grey an
 * unworked incident or ticket deserves. Fold this and every published
 * opportunity goes grey.
 */
const OPPORTUNITY_VARIANTS: Record<OpportunityStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  open: 'success',
  closed: 'outline',
  archived: 'outline',
};

export function OpportunityStatusBadge({ status }: { status: OpportunityStatus }) {
  return <Badge variant={OPPORTUNITY_VARIANTS[status]}>{OPPORTUNITY_STATUS_LABELS[status]}</Badge>;
}

/**
 * Kept out of the kit's STATUS_VARIANTS for two words that mean the opposite of
 * what they mean elsewhere:
 *   canceled  routine here, not a failure — the API's `seated` treats a
 *             canceled signup as a vacated seat and promotes the waitlist, so
 *             it gets outline rather than the canonical destructive.
 *   no_show   the harsher word here than on an event registration: the seat was
 *             reserved, the waitlist was not promoted, and the shift went
 *             uncovered. Event registrations spell it `warning` (see
 *             REGISTRATION_VARIANTS) because an event no-show costs nothing.
 */
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
