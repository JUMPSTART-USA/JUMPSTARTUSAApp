import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
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
import { ListToolbar } from '@/components/ui/toolbar';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { SeverityBadge, vehicleLabel } from './shared';
import type { AlertSeverity, VehicleAlert } from './types';
import { BackLink } from '@/components/BackLink';

// Severity buckets mirror the dashboard's "attention needed" grouping (§6.10).
const GROUPS: { severity: AlertSeverity; title: string; hint: string }[] = [
  { severity: 'overdue', title: 'Overdue', hint: 'Past due — needs attention now' },
  { severity: 'due_soon', title: 'Due soon', hint: 'Due within 30 days or 500 miles' },
  { severity: 'upcoming', title: 'Upcoming', hint: 'Expirations within 60 days' },
];

function AlertsTable({ items, rowHref }: { items: VehicleAlert[]; rowHref: (a: VehicleAlert) => string }) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vehicle</TableHead>
          <TableHead>Chapter</TableHead>
          <TableHead>Alert</TableHead>
          <TableHead>Detail</TableHead>
          <TableHead>Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((alert, i) => (
          <TableRow
            key={`${alert.vehicleId}-${alert.type}-${i}`}
            className="cursor-pointer"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              if ((e.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"]')) return;
              navigate(rowHref(alert));
            }}
          >
            <TableCell className="font-medium">
              {/* Link, not just a row onClick, so the vehicle is reachable by keyboard. */}
              <Link
                to={rowHref(alert)}
                className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {vehicleLabel(alert.vehicle)}
                {alert.vehicle.licensePlate ? (
                  <span className="font-normal text-muted-foreground"> · {alert.vehicle.licensePlate}</span>
                ) : null}
              </Link>
            </TableCell>
            {/* The vehicle's chapter (§7.2). */}
            <TableCell>{alert.vehicle.chapterState}</TableCell>
            <TableCell>{humanize(alert.type)}</TableCell>
            <TableCell className="text-muted-foreground">{alert.message}</TableCell>
            <TableCell>
              {alert.dueDate
                ? formatDate(alert.dueDate)
                : alert.dueMileage != null
                  ? `${alert.dueMileage.toLocaleString('en-US')} mi`
                  : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function FleetAlertsPage() {
  const { user } = useAuth();
  const [stateFilter, setStateFilter] = useState('');
  const query = useQuery({
    queryKey: ['fleet', 'alerts', stateFilter],
    queryFn: () =>
      api.get<{ items: VehicleAlert[]; total: number }>(
        `/vehicles/alerts${qs({ state: stateFilter })}`,
      ),
    placeholderData: keepPreviousData,
  });

  if (query.isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <BackLink fallbackTo="/vehicles" fallbackLabel="Vehicles" />
        <PageHeader
          title="Fleet alerts"
          description="Maintenance due, registration and insurance expirations across active vehicles."
        />
      </div>

      {/* Chapter filter (§7.2) — sent as the `state` query param. Scoped users
          get no toolbar at all: the API already forces their chapter. */}
      {user?.chapter ? null : (
        <ListToolbar>
          <ChapterFilterSelect value={stateFilter} onChange={setStateFilter} />
        </ListToolbar>
      )}

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !query.data || query.data.items.length === 0 ? (
        <EmptyState
          title="No fleet alerts"
          hint="Every active vehicle is current on maintenance, registration and insurance."
        />
      ) : (
        GROUPS.map(({ severity, title, hint }) => {
          const items = query.data.items.filter((a) => a.severity === severity);
          if (items.length === 0) return null;
          return (
            <Card key={severity}>
              <CardHeaderRow
                title={
                  <>
                    {title}
                    <SeverityBadge severity={severity} />
                    <span className="text-sm font-normal text-muted-foreground">
                      {items.length}
                    </span>
                  </>
                }
              >
                <p className="text-sm text-muted-foreground">{hint}</p>
              </CardHeaderRow>
              <CardContent>
                <AlertsTable items={items} rowHref={(a) => `/vehicles/${a.vehicleId}`} />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
