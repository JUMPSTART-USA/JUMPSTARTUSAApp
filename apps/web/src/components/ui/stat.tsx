import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cardSurface } from '@/components/ui/card';
import { fieldLabelClasses } from '@/components/ui/description-list';
import { cn } from '@/lib/utils';
import type { BackNavState } from '@/components/BackLink';

/**
 * A number the reader is meant to take in at a glance, and the card it sometimes
 * sits in. Replaces four rival implementations (dashboard, mentoring, intake,
 * housing) and the hand-rolled label+value stacks scattered across profiles.
 *
 * The split is: `StatTile` is the stack — type scale and reading order, nothing
 * else. `MetricCard` is a card around one of them. Everything the four
 * implementations disagreed about lives outside the stack: the surface, the
 * interaction, and one editorial opinion about whether a number is bad *right
 * now*. So the surface and the interaction move to MetricCard, and the opinion
 * moves to the caller.
 */

export type StatTone = 'warning' | 'destructive';

/**
 * The caller's opinion that this number is bad right now, in a colour AND in
 * words. `note` is required, and that is the whole point: colour alone fails
 * WCAG 1.4.1, and a required field is a compile error where a convention is a
 * review catch.
 *
 * Write the state, not the number again — "past their due date", not "3 are
 * overdue". The number is already on screen directly above it.
 */
export interface StatFlag {
  tone: StatTone;
  note: ReactNode;
}

/**
 * sm 18px · md 24px · lg 30px.
 *
 * These are the three sizes already in use, kept so the migration moves no
 * value: sm is the CRM giving summary, md is every profile strip and the
 * dashboard and housing cards, lg is mentoring and intake. That md/lg split
 * across four screens that do the same job is an unsettled editorial choice, NOT
 * a rule — it is preserved here rather than picked, because picking it would
 * move type on four dashboards to no brief.
 */
export type StatSize = 'sm' | 'md' | 'lg';

const VALUE_SIZE: Record<StatSize, string> = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
};

const TONE_CLASS: Record<StatTone, string> = {
  // Measured on --card (40 100% 99%): warning 4.81:1, destructive 6.38:1 — both
  // clear the 4.5:1 normal-text floor Phase 1 raised --input and --ring to meet,
  // so the tone holds even at `sm`, and on the bg-muted/30 strips (4.42:1) it
  // still clears the 3:1 large-text floor at md and lg.
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/**
 * A tile carries ONE supporting line: either a neutral caption or a flagged one.
 * The union says so, rather than leaving two prose slots and an ordering
 * question nobody would answer the same way twice.
 *
 * A site that needs a caption AND a state composes both into `note` itself —
 * intake does, because its colour lands on the oldest-pending AGE, a different
 * number in a different unit from the count above it. Be honest about the
 * consequence: `flag`'s required-words guarantee does not reach a hand-composed
 * note, so a site doing that owns its own 1.4.1 compliance.
 */
type StatSupport =
  | { flag?: never; note?: ReactNode }
  | { flag: StatFlag | undefined; note?: never };

export type StatTileProps = {
  /**
   * A `p`, and there is no prop that makes it a heading. `CardTitle` is an h3;
   * a heading here would inject ten new h3s into the dashboard's page outline
   * and nest an h3 under the existing h3 at every strip inside a titled Card.
   */
  label: ReactNode;
  /**
   * ReactNode, not `number`. Both card implementations typed this `value:
   * number`, which is exactly why neither could hold money, hours or a date —
   * and why the CRM had to keep a StatTile of its own.
   *
   * Formatting stays with the caller (`fmtCount`, `formatMoney`,
   * `formatHours`); the tile does not know what unit it is holding. This is NOT
   * a colour escape hatch — a tinted span passed here rebuilds the colour-only
   * signal `flag` exists to prevent.
   */
  value: ReactNode;
  size?: StatSize;
  className?: string;
} & StatSupport;

/**
 * A label, a number, and — when the caller has something to say — one line under
 * it.
 *
 * OWNS TYPE SCALE AND READING ORDER, NOTHING ELSE. No border, no background, no
 * padding, no rounding, no grid, no alignment, no interaction, and no colour by
 * default. Its containers already vary six ways and any of that here is wrong at
 * one of them: a bordered `bg-muted/30` strip inside a titled Card; the same
 * strip on a bare page with no Card above it at all (HoursPage); a plain
 * CardContent grid with no strip (InstitutionProfilePage); a left-aligned CRM
 * grid; a bordered cell in a dialog; and a card of its own. Alignment is
 * inherited and the column counts run to five distinct strings.
 *
 * LABEL FIRST, always. Not a preference — a screen reader reads DOM order, and
 * "Active matches, 12" is a fact where "12, active matches" is a guessing game.
 */
export function StatTile({
  label,
  value,
  note,
  flag,
  size = 'md',
  className,
}: StatTileProps) {
  const support = flag ? flag.note : note;
  return (
    <div className={cn('min-w-0', className)}>
      <p className={fieldLabelClasses}>{label}</p>
      <p
        className={cn(
          'mt-0.5 font-semibold leading-tight tabular-nums',
          VALUE_SIZE[size],
          flag && TONE_CLASS[flag.tone],
        )}
      >
        {value}
      </p>
      {/* Never truncated: clipping this would ellipsis away the words a flag
          exists to guarantee. */}
      {support ? <p className="mt-0.5 text-xs text-muted-foreground">{support}</p> : null}
    </div>
  );
}

export type MetricCardProps = StatTileProps & {
  /** Optional gold chip, as on the dashboard. Decorative — never the only label. */
  icon?: LucideIcon;
  /**
   * Where the whole card goes. Omit it and the card is inert: a plain div, no
   * tab stop, no chevron, no hover.
   *
   * Resolve this with `can()` AT THE CALL SITE, where the permission is already
   * in hand — `to={can('alumni.read') ? 'checkins' : undefined}`. A number the
   * reader is allowed to see must never click through to a page they are not:
   * the intake summary deliberately shows the Referrals count to anyone with
   * `intake_queues.read`, but the Referrals tab renders only with
   * `referral_inbox.read`, so a link there would be a lie, not a leak.
   */
  to?: string;
  /** From `backTo(...)`, spread straight in: `{...backTo('/', 'Dashboard')}`. */
  state?: BackNavState;
};

/**
 * One `StatTile` on a card, optionally the whole thing a link.
 *
 * THE PROP LIST IS CLOSED — no `HTMLAttributes` spread, no `...props`. So
 * `onClick`, `role` and `tabIndex` are not reachable from a call site, and the
 * ONLY route to a tab stop is `to`. That is what holds the intake boundary: a
 * card that must not be navigable cannot accidentally become navigable, and
 * making it so is a type error rather than something review has to catch.
 *
 * When `to` is given this renders a real anchor wearing the card surface, rather
 * than the two shapes it replaces — a div with `role="link" tabIndex={0}`
 * (fifteen of them on the dashboard) and an anchor wrapped around a Card
 * (mentoring). That difference is not cosmetic: cmd-click, middle-click and the
 * status-bar URL come back, Space goes back to scrolling the page instead of
 * navigating, and the focus ring lands on the card's own corners.
 *
 * The accessible name is left to come from the contents, so it is label, value
 * and any supporting words — everything the tile says. The dashboard's old
 * `aria-label={`${label} — open`}` REPLACED the contents, which is how ten tiles
 * ended up with a name that never contained the number they exist to
 * communicate. Nothing here may reintroduce an aria-label for that reason.
 */
export function MetricCard({ icon: Icon, to, state, className, ...tile }: MetricCardProps) {
  const body = (
    <>
      {Icon ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gold/15 text-gold-dark">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      ) : null}
      <StatTile {...(tile as StatTileProps)} className="min-w-0 flex-1" />
      {to ? (
        <ChevronRight
          className="h-4 w-4 shrink-0 self-center text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  const inner = cn('flex items-center gap-3 p-4', className);

  if (!to) return <div className={cn(cardSurface, inner)}>{body}</div>;

  return (
    <Link
      to={to}
      state={state}
      className={cn(
        cardSurface,
        inner,
        'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {body}
    </Link>
  );
}
