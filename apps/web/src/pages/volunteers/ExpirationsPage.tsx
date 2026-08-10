import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, humanize } from '@/lib/utils';
import { ExpiryBadge } from './shared';
import type { ExpirationsResult } from './types';
import { BackLink } from '@/components/BackLink';

const WINDOWS = [30, 60, 90] as const;

function VolunteerLink({ profileId, name }: { profileId: string | null; name: string }) {
  if (!profileId) return <span>{name}</span>;
  return (
    <Link to={`/volunteers/${profileId}`} className="font-medium text-primary hover:underline">
      {name}
    </Link>
  );
}

/** §6.6 coordinator dashboard: everything lapsing within the chosen window. */
export function ExpirationsPage() {
  const { can } = useAuth();
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const canReadChecks = can('fields.background_checks.read');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['volunteers', 'expirations', days],
    queryFn: () => api.get<ExpirationsResult>(`/volunteers/expirations${qs({ days })}`),
  });

  return (
    <div className="space-y-4">
      <BackLink fallbackTo="/volunteers" fallbackLabel="Volunteers" />
      <PageHeader
        title="Upcoming expirations"
        description="Checks, trainings and clearances lapsing within the window — already-lapsed items stay listed until renewed."
        actions={
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {WINDOWS.map((w) => (
              <Button
                key={w}
                size="sm"
                variant="ghost"
                className={cn(days === w && 'bg-card shadow')}
                onClick={() => setDays(w)}
              >
                {w} days
              </Button>
            ))}
          </div>
        }
      />

      {isLoading ? <PageLoader /> : null}
      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {data ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>
                Background checks{' '}
                <span className="font-normal text-muted-foreground">
                  ({data.backgroundChecks.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {!canReadChecks ? (
                <div className="px-5 pb-3">
                  <Notice variant="warning">
                    Background-check expiration dates require the background-check field
                    permission (§7.2) — this section is hidden for your role.
                  </Notice>
                </div>
              ) : data.backgroundChecks.length === 0 ? (
                <p className="px-5 pb-3 text-sm text-muted-foreground">
                  Nothing lapsing in this window.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Volunteer</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.backgroundChecks.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <VolunteerLink
                            profileId={row.person.volunteerProfile?.id ?? null}
                            name={`${row.person.firstName} ${row.person.lastName}`}
                          />
                        </TableCell>
                        <TableCell>{row.vendor}</TableCell>
                        <TableCell>
                          <ExpiryBadge date={row.expiresAt} warnDays={days} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>
                Trainings{' '}
                <span className="font-normal text-muted-foreground">({data.trainings.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {data.trainings.length === 0 ? (
                <p className="px-5 pb-3 text-sm text-muted-foreground">
                  Nothing lapsing in this window.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Volunteer</TableHead>
                      <TableHead>Training</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.trainings.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <VolunteerLink
                            profileId={row.volunteerProfile?.id ?? null}
                            name={
                              row.volunteerProfile
                                ? `${row.volunteerProfile.person.firstName} ${row.volunteerProfile.person.lastName}`
                                : '—'
                            }
                          />
                        </TableCell>
                        <TableCell>{row.trainingType}</TableCell>
                        <TableCell>
                          <ExpiryBadge date={row.expiresAt} warnDays={days} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>
                Facility clearances{' '}
                <span className="font-normal text-muted-foreground">
                  ({data.clearances.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {data.clearances.length === 0 ? (
                <p className="px-5 pb-3 text-sm text-muted-foreground">
                  Nothing lapsing in this window.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Volunteer</TableHead>
                      <TableHead>Requirement</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.clearances.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <VolunteerLink
                            profileId={row.volunteerProfile?.id ?? null}
                            name={
                              row.volunteerProfile
                                ? `${row.volunteerProfile.person.firstName} ${row.volunteerProfile.person.lastName}`
                                : '—'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {row.requirement.name}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({humanize(row.requirement.requirementType)})
                          </span>
                          {row.requirement.hardBlock ? (
                            <Badge variant="destructive" className="ml-2">
                              Hard block
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.requirement.institution.name}</TableCell>
                        <TableCell>
                          <ExpiryBadge date={row.expiresAt} warnDays={days} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {data.backgroundChecks.length === 0 &&
          data.trainings.length === 0 &&
          data.clearances.length === 0 ? (
            <EmptyState
              title="All clear"
              hint={`Nothing expires within ${days} days.`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
