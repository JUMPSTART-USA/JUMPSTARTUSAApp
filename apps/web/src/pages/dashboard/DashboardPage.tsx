import { INSIDE_STATUSES, OUTSIDE_STATUSES, US_STATES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Bus,
  CalendarDays,
  CheckCircle2,
  Clock,
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
import { useState } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { api, qs } from '@/lib/api';
import { cn, formatDate, formatMoney, humanize } from '@/lib/utils';
import { CampaignProgressChart, type DashboardCampaign } from './CampaignProgressChart';

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
  donationsLastSyncedAt?: string | null;
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
};

const fmtCount = (n: number) => n.toLocaleString('en-US');
const fmtDateTime = (value: string) => format(new Date(value), 'MMM d, yyyy h:mm a');

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-semibold leading-tight">{fmtCount(value)}</div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          {hint ? <div className="truncate text-[11px] text-muted-foreground/80">{hint}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [state, setState] = useState('');
  const [participantStatus, setParticipantStatus] = useState('');

  const hasFilters = Boolean(from || to || state || participantStatus);
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

  const reset = () => {
    setFrom('');
    setTo('');
    setState('');
    setParticipantStatus('');
  };

  const data = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {data ? (
          <p className="text-xs text-muted-foreground">
            Data as of {fmtDateTime(data.generatedAt)} · cached up to 5 minutes
          </p>
        ) : null}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label htmlFor="dash-from" className="text-xs">
              From
            </Label>
            <Input
              id="dash-from"
              type="date"
              className="h-8 w-36"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-to" className="text-xs">
              To
            </Label>
            <Input
              id="dash-to"
              type="date"
              className="h-8 w-36"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-state" className="text-xs">
              State
            </Label>
            <Select
              id="dash-state"
              className="h-8 w-32"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">All states</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-status" className="text-xs">
              Participant status
            </Label>
            <Select
              id="dash-status"
              className="h-8 w-44"
              value={participantStatus}
              onChange={(e) => setParticipantStatus(e.target.value)}
            >
              <option value="">Active (default)</option>
              {PARTICIPANT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </div>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset
            </Button>
          ) : null}
          <p className="ml-auto self-center text-[11px] text-muted-foreground">
            Filters apply only to widgets that carry the dimension.
          </p>
        </CardContent>
      </Card>

      {invalidRange ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The “from” date is after the “to” date — adjust the range to load the dashboard.
        </div>
      ) : query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : data ? (
        <div className={cn('space-y-4 transition-opacity', query.isFetching && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {data.activeParticipants !== undefined ? (
              <StatCard
                icon={Users}
                label="Participants"
                value={data.activeParticipants}
                hint={participantStatus ? `${humanize(participantStatus)} status` : 'Active inside or outside'}
              />
            ) : null}
            {data.participantsInHousing !== undefined ? (
              <StatCard icon={Home} label="In housing" value={data.participantsInHousing} hint="Active enrollments" />
            ) : null}
            {data.activeInsideClasses !== undefined ? (
              <StatCard icon={School} label="Inside classes" value={data.activeInsideClasses} hint="Active" />
            ) : null}
            {data.activeOutsidePrograms !== undefined ? (
              <StatCard icon={GraduationCap} label="Outside programs" value={data.activeOutsidePrograms} hint="Active" />
            ) : null}
            {data.volunteersActive !== undefined ? (
              <StatCard icon={HandHeart} label="Volunteers" value={data.volunteersActive} hint="Active" />
            ) : null}
            {data.employedParticipants !== undefined ? (
              <StatCard icon={Briefcase} label="Employed participants" value={data.employedParticipants} />
            ) : null}
            {data.activeEmployers !== undefined ? (
              <StatCard icon={Building2} label="Employer partners" value={data.activeEmployers} hint="Partner or hiring" />
            ) : null}
            {data.vehiclesActive !== undefined ? (
              <StatCard
                icon={Bus}
                label="Vehicles"
                value={data.vehiclesActive}
                hint={data.vehicleAlerts ? `${fmtCount(data.vehicleAlerts)} with alerts` : 'No alerts'}
              />
            ) : null}
            {data.completedPrograms !== undefined ? (
              <StatCard
                icon={CheckCircle2}
                label="Completions"
                value={data.completedPrograms}
                hint={hasPeriod ? 'In selected period' : 'All time'}
              />
            ) : null}
            {data.leftEarly !== undefined ? (
              <StatCard
                icon={UserMinus}
                label="Left early"
                value={data.leftEarly}
                hint={hasPeriod ? 'In selected period' : 'All time'}
              />
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Attention needed
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.attentionNeeded.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All clear — nothing needs attention right now.</p>
                ) : (
                  <ul className="divide-y">
                    {data.attentionNeeded.map((item) => (
                      <li key={item.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                        <span className="text-sm">{item.label}</span>
                        <Badge variant={ATTENTION_SEVERITY[item.key] ?? 'warning'}>{fmtCount(item.count)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {data.donationTotal !== undefined ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HandCoins className="h-4 w-4 text-primary" /> Donations
                  </CardTitle>
                  <CardDescription>{hasPeriod ? 'Selected period' : 'All time'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-semibold">{formatMoney(data.donationTotal)}</div>
                  {data.donorCount !== undefined ? (
                    <p className="text-sm text-muted-foreground">
                      {fmtCount(data.donorCount)} {data.donorCount === 1 ? 'donor' : 'donors'}{' '}
                      {hasPeriod ? 'gave in this period' : 'on record'}
                    </p>
                  ) : null}
                  {data.donationsLastSyncedAt !== undefined ? (
                    data.donationsLastSyncedAt ? (
                      <p className="flex items-center gap-1.5 border-t pt-2 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" /> Bloomerang · last synced {fmtDateTime(data.donationsLastSyncedAt)}
                      </p>
                    ) : (
                      <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        No successful Bloomerang sync on record — totals may be incomplete.
                      </p>
                    )
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {data.intakeQueues ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Inbox className="h-4 w-4 text-primary" /> Intake queue
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
              </Card>
            ) : null}

            {data.recentCaseActivity ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HeartHandshake className="h-4 w-4 text-primary" /> Case activity
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
              </Card>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {data.activeCampaigns ? (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Campaign progress</CardTitle>
                  <CardDescription>Raised to date against goal — not period-filtered</CardDescription>
                </CardHeader>
                <CardContent>
                  <CampaignProgressChart campaigns={data.activeCampaigns} />
                </CardContent>
              </Card>
            ) : null}

            {data.upcomingEvents ? (
              <Card className={cn(!data.activeCampaigns && 'lg:col-span-3')}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="h-4 w-4 text-primary" /> Upcoming events
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
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
