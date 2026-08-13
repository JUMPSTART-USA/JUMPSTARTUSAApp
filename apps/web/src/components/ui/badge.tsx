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

/**
 * The one status→colour map. Every badge that colours a status reads it through
 * `StatusBadge`, so a status looks the same wherever it is rendered.
 *
 * SEMANTICS, so the next addition does not have to guess:
 *   success     terminal good        approved, delivered, resolved
 *   info        terminal neutral     completed, transferred, sent
 *   warning     needs attention      pending, in_review, partially_sent
 *   destructive terminal bad/blocked rejected, failed, removed
 *   outline     inert / n-a          closed, dismissed, draft, unknown
 *   secondary   awaiting action      applicant, queued, proposed
 *
 * WHAT IS DELIBERATELY NOT HERE. Four words carry different meanings per module
 * and the API enforces the difference, so they keep module-local maps rather
 * than one wrong global ruling:
 *   canceled  a canceled SIGNUP vacates a seat and promotes the waitlist
 *             (opportunities.service.ts `seated`), routine — outline. A canceled
 *             CLASS throws ConflictException on enrollment — destructive.
 *   open      an open INCIDENT is a problem awaiting work; an open OPPORTUNITY
 *             is published and healthy, and is the only live signal on that list.
 *   no_show   a volunteer no-show left a reserved seat and a shift uncovered;
 *             an event no-show costs nothing.
 *   overdue   fleet maintenance is OUR lateness; a recurring gift's missed date
 *             is the donor's card, and no staff member is late.
 * Each survivor says so at its definition. Adding a key here that one of those
 * modules already spells differently will silently re-colour their screens.
 *
 * One word is shared but not synonymous: employment reads `completed` beside
 * Start and End dates, where it means "this placement ended" rather than the
 * neutral "done" it means elsewhere. Both spell it info today, so the module
 * needs no map of its own — but a future edit here decides for both, and
 * whether a finished placement should read as a win is a product call.
 */
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
  // Drug-test results
  negative: 'success',
  positive: 'destructive',
  inconclusive: 'warning',
  diluted: 'warning',
  refused: 'destructive',
  // Travel requests / incident reports
  denied: 'destructive',
  dismissed: 'outline',
  // Portal queues
  new: 'info',
  read: 'outline',
  responded: 'success',
  scheduled: 'success',
  declined: 'destructive',
  minor: 'outline',
  major: 'warning',
  critical: 'destructive',
  // Communications (folded from communications/shared.tsx — no key collided).
  draft: 'outline',
  queued: 'secondary',
  sent: 'info',
  delivered: 'success',
  /** A dispatch where some or all messages failed no longer reports "Sent". */
  partially_sent: 'warning',
  failed: 'destructive',
  returned: 'warning',
  // Employer hiring posture (folded from employment/shared.tsx).
  prospect: 'secondary',
  partner: 'info',
  actively_hiring: 'success',
  // Employment records (folded from employment/shared.tsx). `completed` above
  // now answers for placements too — see the note on it in the block comment.
  applied: 'secondary',
  interviewing: 'info',
  hired: 'success',
  terminated: 'destructive',
  resigned: 'warning',
  unknown: 'outline',
  // Donor lifecycle (folded from crm/shared.tsx — its labels were exactly what
  // humanize() produces, so the badges read identically).
  prospective: 'outline',
  lapsed: 'warning',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'}>{humanize(status)}</Badge>;
}
