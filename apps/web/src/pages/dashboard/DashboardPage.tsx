import { CHAPTER_STATES, INSIDE_STATUSES, OUTSIDE_STATUSES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Bus,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  HandCoins,
  HandHeart,
  HeartHandshake,
  Home,
  Inbox,
  School,
  UserMinus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backTo } from '@/components/BackLink';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { ListToolbar, ToolbarDateField, ToolbarSpacer } from '@/components/ui/toolbar';
import { api, qs } from '@/lib/api';
import { P, useListParams } from '@/lib/list-params';
import { cn, formatDate, formatMoney, humanize } from '@/lib/utils';
/**
 * recharts — with d3 and lodash behind it — is 383 KB, 23% of everything the app
 * shipped, and it hangs off this ONE component, rendered once, below the fold.
 *
 * Lazy ROUTES do not help here, because the dashboard is the index route: its
 * chunk is on the landing path by definition. So the chart splits separately and
 * the rest of the dashboard paints without waiting for it.
 *
 * The type import stays static — it erases at build and pulls in nothing.
 */
import type { DashboardCampaign } from './CampaignProgressChart';

const CampaignProgressChart = lazy(() =>
  import('./CampaignProgressChart').then((m) => ({ default: m.CampaignProgressChart })),
);

// Mirrors the controller's PARTICIPANT_STATUS_FILTERS: statuses overlap between
// the inside and outside domains, so the filter offers the deduplicated union.
const PARTICIPANT_STATUS_OPTIONS = [...new Set<string>([...INSIDE_STATUSES, ...OUTSIDE_STATUSES])];

interface AttentionItem {
  key: string;
  label: string;
  count: number;
}

interface DashboardEvent {
  id: string;
  name: string;
  eventType: string;
  eventDate: string;
  location: string | null;
}

/** Widget keys are present only when the user holds that module's read permission. */
interface DashboardOverview {
  generatedAt: string;
  attentionNeeded: AttentionItem[];
  activeInsideClasses?: number;
  activeOutsidePrograms?: number;
  activeParticipants?: number;
  participantsInHousing?: number;
  completedPrograms?: number;
  leftEarly?: number;
  volunteersActive?: number;
  donorCount?: number;
  donationTotal?: number;
  pledgesActive?: { count: number; outstanding: number };
  recurringActive?: number;
  unacknowledgedDonations?: number;
  volunteerHoursMonth?: number;
  pendingTimesheets?: number;
  upcomingShifts7?: number;
  activeCampaigns?: DashboardCampaign[];
  upcomingEvents?: DashboardEvent[];
  activeEmployers?: number;
  employedParticipants?: number;
  vehiclesActive?: number;
  vehicleAlerts?: number;
  recentCaseActivity?: { notes: number; services: number; total: number };
  intakeQueues?: {
    volunteerApplicationsPending: number;
    referralsPending: number;
    oldestPendingDays: number | null;
  };
}

// The API's AttentionItem carries no severity — derive it from the alert key.
const ATTENTION_SEVERITY: Record<string, BadgeProps['variant']> = {
  vehicle_alerts: 'warning',
  clearance_expirations: 'warning',
  overdue_follow_ups: 'destructive',
  intake_sla_breaches: 'destructive',
  portal_requests_pending: 'warning',
  unacknowledged_donations: 'warning',
  pending_timesheets: 'warning',
};

// Every dashboard widget links to the functional area its numbers come from.
const ATTENTION_LINKS: Record<string, string> = {
  vehicle_alerts: '/vehicles/alerts',
  clearance_expirations: '/volunteers/expirations',
  overdue_follow_ups: '/case-management',
  intake_sla_breaches: '/intake',
  portal_requests_pending: '/case-management/requests',
  unacknowledged_donations: '/donors/acknowledgments',
  pending_timesheets: '/volunteers/hours',
};

/**
 * Which of the dashboard's filters each destination can actually receive.
 *
 * The audit's finding was that all 22 drill-downs navigate to a BARE path, so
 * setting a chapter and opening a card silently showed the whole org — the
 * number you clicked and the list you landed on disagreed, with nothing saying
 * why.
 *
 * This map is deliberately explicit rather than "append every filter and let the
 * destination ignore what it does not know", because those two things are not
 * the same: an unknown key would sit in the URL looking like it applied.
 *
 *  - `chapter` names the destination's own chapter key. Housing's is
 *    `homes.state`, because that route mounts two lists and namespaces both.
 *  - `dates` is true only where the destination really has from/to. The toolbar
 *    already tells the user the range applies "only to those that carry a date",
 *    and this is the same rule.
 *  - An EMPTY entry means the target has no filter to receive: /intake keeps its
 *    per-queue filters namespaced, and the case-management landing page has
 *    none at all. They are listed rather than omitted so that "nothing to carry"
 *    reads as a decision instead of an oversight.
 *
 * The dashboard's `participantStatus` is carried NOWHERE on purpose. It is the
 * deduplicated union of the inside and outside domains (see
 * PARTICIPANT_STATUS_OPTIONS), while the participants list keeps `insideStatus`
 * and `outsideStatus` apart — and a value present in both domains cannot be
 * mapped to one of them without guessing. Silently filtering by the wrong domain
 * would be worse than not filtering.
 */
const DRILL_TARGETS: Record<
  string,
  { chapter?: string; dates?: boolean; extra?: Record<string, string> }
> = {
  '/participants': { chapter: 'state' },
  /**
   * Housing needs `tab` too, not just the chapter. The route lands on the
   * OCCUPANCY tab by default, where the homes list — and therefore
   * `homes.state` — is not even mounted, so the chapter would sit in the URL
   * looking applied while the view showed every chapter. Measured: with only
   * `homes.state=GA`, the page requested `/transitional-homes/occupancy` and
   * listed all five homes. Sending `tab=homes` lands where the filter is real.
   */
  '/housing': { chapter: 'homes.state', extra: { tab: 'homes' } },
  '/inside-classes': { chapter: 'state' },
  '/outside-programs': { chapter: 'state' },
  '/volunteers': { chapter: 'state' },
  '/employers': { chapter: 'state' },
  '/vehicles': { chapter: 'state' },
  '/campaigns': { chapter: 'state' },
  '/events': { chapter: 'state' },
  '/donors/donations': { chapter: 'state', dates: true },
  '/intake': {},
  '/case-management': {},
};

const fmtCount = (n: number) => n.toLocaleString('en-US');
const fmtDateTime = (value: string) => format(new Date(value), 'MMM d, yyyy h:mm a');

/**
 * Build a destination URL carrying whatever filters it understands.
 *
 * Sub-paths inherit their section's entry (`/vehicles/alerts` is treated as
 * `/vehicles`), so a link added later still carries the chapter without being
 * listed twice.
 *
 * A plain function, not a hook: it calls nothing from React, and keeping it
 * plain is what lets drill-down.test.ts check the map directly.
 */
export function buildDrillTo(filters: { from: string; to: string; state: string }) {
  return (path: string) => {
    const target =
      DRILL_TARGETS[path] ??
      DRILL_TARGETS[Object.keys(DRILL_TARGETS).find((base) => path.startsWith(`${base}/`)) ?? ''];
    if (!target) return path;
    const params: Record<string, string | undefined> = {};
    if (target.chapter && filters.state) params[target.chapter] = filters.state;
    // `extra` only rides along when a filter is actually being carried: an
    // unfiltered click should land on the section's normal default view.
    if (target.extra && filters.state) Object.assign(params, target.extra);
    if (target.dates) {
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
    }
    return `${path}${qs(params)}`;
  };
}

/** The dashboard's one gold accent: an icon chip shared by stat and info cards. */
function TitleIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gold/15 text-gold-dark">
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint?: string;
  /** Functional area this number comes from — the whole card navigates there. */
  to: string;
}) {
  const navigate = useNavigate();
  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={`${label} — open`}
      className="cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => navigate(to, backTo('/', 'Dashboard'))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(to, backTo('/', 'Dashboard'));
        }
      }}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gold/15 text-gold-dark">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="font-display text-2xl font-semibold leading-tight">{fmtCount(value)}</div>
          {hint ? <div className="truncate text-[11px] text-muted-foreground/80">{hint}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Info-card wrapper that navigates to its functional area on click. */
function NavCard({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <Card
      role="link"
      tabIndex={0}
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={() => navigate(to, backTo('/', 'Dashboard'))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(to, backTo('/', 'Dashboard'));
        }
      }}
    >
      {children}
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  /**
   * The dashboard's own filters live in the URL for the same reason every list's
   * do — but here it also makes the drill-downs work in BOTH directions: set a
   * chapter, open a card, press Back, and the dashboard comes back filtered
   * rather than reset to everything.
   */
  const { values, set, clear, isFiltered } = useListParams({
    from: P.date(),
    to: P.date(),
    state: P.choice(CHAPTER_STATES, ''),
    participantStatus: P.choice(PARTICIPANT_STATUS_OPTIONS, ''),
  });
  const { from, to, state, participantStatus } = values;
  /** Carries the filters above into whichever destination understands them. */
  const drillTo = buildDrillTo({ from, to, state });

  const hasFilters = isFiltered;
  const hasPeriod = Boolean(from || to);
  // ISO date strings compare lexicographically — catch the 400 before it happens.
  const invalidRange = Boolean(from && to && from > to);

  const filters = { from, to, state, participantStatus };
  const query = useQuery({
    queryKey: ['dashboard', 'overview', filters],
    queryFn: () => api.get<DashboardOverview>(`/dashboard${qs(filters)}`),
    placeholderData: keepPreviousData,
    enabled: !invalidRange,
  });

  const data = query.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description={
          data ? `Data as of ${fmtDateTime(data.generatedAt)} · cached up to 5 minutes` : undefined
        }
      />

      <ListToolbar className="items-end">
        <ToolbarDateField
          label="From"
          className="sm:w-36"
          value={values.from}
          onChange={(e) => set('from', e.target.value)}
        />
        <ToolbarDateField
          label="To"
          className="sm:w-36"
          value={values.to}
          onChange={(e) => set('to', e.target.value)}
        />
        {/* Chapter (§7.2), not a 50-state address filter: the API validates
            against CHAPTER_STATES and forces a scoped user's own chapter. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
        <FilterSelect
          aria-label="Participant status"
          className="w-full sm:w-44"
          value={values.participantStatus}
          onChange={(value) =>
            set('participantStatus', value as (typeof PARTICIPANT_STATUS_OPTIONS)[number] | '')
          }
        >
          <option value="">Active (default)</option>
          {PARTICIPANT_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        {hasFilters ? (
          <Button variant="ghost" onClick={clear}>
            Reset
          </Button>
        ) : null}
        <ToolbarSpacer />
        <p className="text-xs text-muted-foreground">
          Chapter applies to every widget; the date range only to those that carry a date.
        </p>
      </ListToolbar>

      {invalidRange ? (
        <Notice variant="warning">
          The “from” date is after the “to” date — adjust the range to load the dashboard.
        </Notice>
      ) : query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : data ? (
        <div className={cn('space-y-4 transition-opacity', query.isFetching && 'opacity-60')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {data.activeParticipants !== undefined ? (
              <StatCard
                icon={Users}
                label="Participants"
                value={data.activeParticipants}
                to={drillTo('/participants')}
                hint={participantStatus ? `${humanize(participantStatus)} status` : 'Active inside or outside'}
              />
            ) : null}
            {data.participantsInHousing !== undefined ? (
              <StatCard icon={Home} label="In housing" value={data.participantsInHousing} hint="Active enrollments" to={drillTo('/housing')} />
            ) : null}
            {data.activeInsideClasses !== undefined ? (
              <StatCard icon={School} label="Inside classes" value={data.activeInsideClasses} hint="Active" to={drillTo('/inside-classes')} />
            ) : null}
            {data.activeOutsidePrograms !== undefined ? (
              <StatCard icon={GraduationCap} label="Outside programs" value={data.activeOutsidePrograms} hint="Active" to={drillTo('/outside-programs')} />
            ) : null}
            {data.volunteersActive !== undefined ? (
              <StatCard
                icon={HandHeart}
                label="Volunteers"
                value={data.volunteersActive}
                hint={
                  [
                    data.volunteerHoursMonth !== undefined
                      ? `${fmtCount(data.volunteerHoursMonth)} hrs this month`
                      : null,
                    data.upcomingShifts7 ? `${fmtCount(data.upcomingShifts7)} shifts next 7 days` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Active'
                }
                to={drillTo('/volunteers')}
              />
            ) : null}
            {data.employedParticipants !== undefined ? (
              <StatCard icon={Briefcase} label="Employed participants" value={data.employedParticipants} to={drillTo('/employers')} />
            ) : null}
            {data.activeEmployers !== undefined ? (
              <StatCard icon={Building2} label="Employer partners" value={data.activeEmployers} hint="Partner or hiring" to={drillTo('/employers')} />
            ) : null}
            {data.vehiclesActive !== undefined ? (
              <StatCard
                icon={Bus}
                label="Vehicles"
                value={data.vehiclesActive}
                hint={data.vehicleAlerts ? `${fmtCount(data.vehicleAlerts)} with alerts` : 'No alerts'}
                to={drillTo('/vehicles')}
              />
            ) : null}
            {data.completedPrograms !== undefined ? (
              <StatCard
                icon={CheckCircle2}
                label="Completions"
                value={data.completedPrograms}
                hint={hasPeriod ? 'In selected period' : 'All time'}
                to={drillTo('/participants')}
              />
            ) : null}
            {data.leftEarly !== undefined ? (
              <StatCard
                icon={UserMinus}
                label="Left early"
                value={data.leftEarly}
                hint={hasPeriod ? 'In selected period' : 'All time'}
                to={drillTo('/participants')}
              />
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>
                  <TitleIcon icon={AlertTriangle} /> Attention needed
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.attentionNeeded.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All clear — nothing needs attention right now.</p>
                ) : (
                  <ul className="divide-y">
                    {data.attentionNeeded.map((item) => {
                      const to = ATTENTION_LINKS[item.key];
                      return (
                        <li
                          key={item.key}
                          role={to ? 'link' : undefined}
                          tabIndex={to ? 0 : undefined}
                          className={cn(
                            'flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0',
                            to && 'cursor-pointer -mx-2 rounded-md px-2 transition-colors hover:bg-accent',
                          )}
                          onClick={to ? () => navigate(drillTo(to), backTo('/', 'Dashboard')) : undefined}
                          onKeyDown={
                            to
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigate(drillTo(to), backTo('/', 'Dashboard'));
                                  }
                                }
                              : undefined
                          }
                        >
                          <span className="text-sm">{item.label}</span>
                          <Badge variant={ATTENTION_SEVERITY[item.key] ?? 'warning'}>{fmtCount(item.count)}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {data.donationTotal !== undefined ? (
              <NavCard to={drillTo('/donors/donations')}>
                <CardHeader className="pb-3">
                  <CardTitle>
                    <TitleIcon icon={HandCoins} /> Donations
                  </CardTitle>
                  <CardDescription>{hasPeriod ? 'Selected period' : 'All time'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="font-display text-3xl font-semibold">
                    {formatMoney(data.donationTotal)}
                  </div>
                  {data.donorCount !== undefined ? (
                    <p className="text-sm text-muted-foreground">
                      {fmtCount(data.donorCount)} {data.donorCount === 1 ? 'donor' : 'donors'}{' '}
                      {hasPeriod ? 'gave in this period' : 'on record'}
                    </p>
                  ) : null}
                  {data.pledgesActive !== undefined ||
                  data.recurringActive !== undefined ||
                  data.unacknowledgedDonations !== undefined ? (
                    <div className="space-y-1.5 border-t pt-2">
                      {data.pledgesActive !== undefined ? (
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">
                            Pledges outstanding ({fmtCount(data.pledgesActive.count)} active)
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatMoney(data.pledgesActive.outstanding)}
                          </span>
                        </div>
                      ) : null}
                      {data.recurringActive !== undefined ? (
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">Recurring gifts active</span>
                          <span className="font-semibold tabular-nums">{fmtCount(data.recurringActive)}</span>
                        </div>
                      ) : null}
                      {data.unacknowledgedDonations !== undefined ? (
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">Awaiting acknowledgment</span>
                          <span className="font-semibold tabular-nums">
                            {fmtCount(data.unacknowledgedDonations)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </NavCard>
            ) : null}

            {data.intakeQueues ? (
              <NavCard to={drillTo('/intake')}>
                <CardHeader className="pb-3">
                  <CardTitle>
                    <TitleIcon icon={Inbox} /> Intake queue
                  </CardTitle>
                  <CardDescription>Pending submissions (counts only)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Volunteer applications</span>
                    <span className="font-semibold tabular-nums">
                      {fmtCount(data.intakeQueues.volunteerApplicationsPending)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Referrals</span>
                    <span className="font-semibold tabular-nums">{fmtCount(data.intakeQueues.referralsPending)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2 text-sm">
                    <span className="text-muted-foreground">Oldest pending</span>
                    {data.intakeQueues.oldestPendingDays === null ? (
                      <Badge variant="success">Queue empty</Badge>
                    ) : (
                      <Badge variant={data.intakeQueues.oldestPendingDays > 3 ? 'destructive' : 'success'}>
                        {data.intakeQueues.oldestPendingDays}{' '}
                        {data.intakeQueues.oldestPendingDays === 1 ? 'day' : 'days'}
                        {data.intakeQueues.oldestPendingDays > 3 ? ' — past SLA' : ''}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Target: first review within 3 days.</p>
                </CardContent>
              </NavCard>
            ) : null}

            {data.recentCaseActivity ? (
              <NavCard to={drillTo('/case-management')}>
                <CardHeader className="pb-3">
                  <CardTitle>
                    <TitleIcon icon={HeartHandshake} /> Case activity
                  </CardTitle>
                  <CardDescription>Last 7 days (fixed window)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Case notes added</span>
                    <span className="font-semibold tabular-nums">{fmtCount(data.recentCaseActivity.notes)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Services logged</span>
                    <span className="font-semibold tabular-nums">{fmtCount(data.recentCaseActivity.services)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2 text-sm">
                    <span className="text-muted-foreground">Total entries</span>
                    <span className="font-semibold tabular-nums">{fmtCount(data.recentCaseActivity.total)}</span>
                  </div>
                </CardContent>
              </NavCard>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {data.activeCampaigns ? (
              <NavCard to={drillTo('/campaigns')} className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle>Campaign progress</CardTitle>
                  <CardDescription>Raised to date against goal — not period-filtered</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Its own boundary, so the chart's 383 KB never holds up the
                      cards around it. */}
                  <Suspense fallback={<PageLoader label="Loading chart…" />}>
                    <CampaignProgressChart campaigns={data.activeCampaigns} />
                  </Suspense>
                </CardContent>
              </NavCard>
            ) : null}

            {data.upcomingEvents ? (
              <NavCard to={drillTo('/events')} className={cn(!data.activeCampaigns && 'lg:col-span-3')}>
                <CardHeader className="pb-3">
                  <CardTitle>
                    <TitleIcon icon={CalendarDays} /> Upcoming events
                  </CardTitle>
                  <CardDescription>Next 60 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.upcomingEvents.length === 0 ? (
                    <EmptyState title="No upcoming events" hint="Events in the next 60 days appear here." />
                  ) : (
                    <ul className="divide-y">
                      {data.upcomingEvents.slice(0, 8).map((event) => (
                        <li key={event.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                          <span className="w-20 shrink-0 text-xs text-muted-foreground">
                            {formatDate(event.eventDate)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{event.name}</div>
                            {event.location ? (
                              <div className="truncate text-xs text-muted-foreground">{event.location}</div>
                            ) : null}
                          </div>
                          <Badge variant="secondary">{humanize(event.eventType)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {data.upcomingEvents.length > 8 ? (
                    <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                      +{fmtCount(data.upcomingEvents.length - 8)} more in the next 60 days
                    </p>
                  ) : null}
                </CardContent>
              </NavCard>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
