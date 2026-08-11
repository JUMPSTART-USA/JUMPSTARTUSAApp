import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeaderRow,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import type { CheckinView, OversightData } from './types';

function StatCard({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: number;
  to?: string;
  tone?: 'warn';
}) {
  const body = (
    <Card className={to ? 'transition-colors hover:bg-accent/50' : undefined}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={
            tone === 'warn' && value > 0 ? 'text-3xl font-semibold text-warning' : 'text-3xl font-semibold'
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/** Mentoring oversight dashboard (§6.7 workflow 5). */
export function MentoringHomePage() {
  const { can } = useAuth();
  const navigate = useNavigate();

  const oversight = useQuery({
    queryKey: ['mentoring', 'oversight'],
    queryFn: () => api.get<OversightData>('/mentoring/oversight'),
  });

  // The oversight endpoint returns only a count of overdue check-ins; pull the
  // top of the queue itself for the work list (needs alumni.read).
  const overdue = useQuery({
    queryKey: ['mentoring', 'checkins', 'overdue-preview'],
    queryFn: () =>
      api.get<Paged<CheckinView>>(
        `/outcome-checkins${qs({ due: 'overdue', pageSize: 5, sortBy: 'dueDate', sortDir: 'asc' })}`,
      ),
    enabled: can('alumni.read'),
  });

  if (oversight.isLoading) return <PageLoader />;
  if (oversight.isError) return <ErrorState error={oversight.error} onRetry={oversight.refetch} />;
  const data = oversight.data!;

  const pipelineTotal = Object.values(data.screeningsInPipeline).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active matches" value={data.activeMatches} to="assignments" />
        <StatCard
          label="No session in 30 days"
          value={data.matchesNoSessionIn30Days.length}
          tone="warn"
        />
        <StatCard label="Screenings in pipeline" value={pipelineTotal} to="screenings" />
        <StatCard
          label="Overdue check-ins"
          value={data.checkinsOverdue}
          to={can('alumni.read') ? 'checkins' : undefined}
          tone="warn"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Screening pipeline by stage</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineTotal === 0 ? (
              <p className="text-sm text-muted-foreground">No screenings in progress.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(data.screeningsInPipeline).map(([stage, count]) => (
                  <div key={stage} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 text-sm">{humanize(stage)}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(4, (count / pipelineTotal) * 100)}%` }}
                      />
                    </div>
                    <div className="w-8 text-right text-sm font-medium">{count}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alumni engagement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold">{data.alumniEngagementLast90Days}</div>
            <p className="text-sm text-muted-foreground">
              Engagements logged in the last 90 days.
            </p>
            {can('alumni.read') ? (
              <Link to="engagements" className="text-sm text-primary hover:underline">
                View engagement log
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active matches with no session in 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          {data.matchesNoSessionIn30Days.length === 0 ? (
            <EmptyState title="All active matches have met recently" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mentor</TableHead>
                  <TableHead>Participant</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Last session</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.matchesNoSessionIn30Days.map((m) => (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer"
                    // Ignores modified clicks and clicks that started on a link or
                    // button, so cmd-click still opens a new tab.
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      if (
                        (e.target as HTMLElement).closest(
                          'a,button,input,select,textarea,[role="button"]',
                        )
                      )
                        return;
                      navigate(`assignments/${m.id}`);
                    }}
                  >
                    <TableCell>
                      {/* The row was click-only; this link is the keyboard path to the match. */}
                      <Link
                        to={`assignments/${m.id}`}
                        className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {m.mentorName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {m.participantName}{' '}
                      <span className="text-muted-foreground">· {m.participantNumber}</span>
                    </TableCell>
                    <TableCell>{formatDate(m.startDate)}</TableCell>
                    <TableCell>
                      {m.lastSessionDate ? (
                        <span className="text-warning">{formatDate(m.lastSessionDate)}</span>
                      ) : (
                        <Badge variant="warning">Never</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {can('alumni.read') ? (
        <Card>
          <CardHeaderRow title="Overdue outcome check-ins">
            <Link to="checkins" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeaderRow>
          <CardContent>
            {overdue.isError ? (
              <ErrorState error={overdue.error} onRetry={overdue.refetch} />
            ) : !overdue.data || overdue.data.items.length === 0 ? (
              <EmptyState title="No overdue check-ins" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead>Wave</TableHead>
                    <TableHead>Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdue.data.items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          to={`/participants/${c.participantProfile.id}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.participantProfile.person.firstName}{' '}
                          {c.participantProfile.person.lastName}
                        </Link>{' '}
                        <span className="text-muted-foreground">
                          · {c.participantProfile.participantNumber}
                        </span>
                      </TableCell>
                      <TableCell>{humanize(c.wave)}</TableCell>
                      <TableCell className="text-destructive">{formatDate(c.dueDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
