import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

function AlertsTable({ items, onRowClick }: { items: VehicleAlert[]; onRowClick: (a: VehicleAlert) => void }) {
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
            onClick={() => onRowClick(alert)}
          >
            <TableCell className="font-medium">
              {vehicleLabel(alert.vehicle)}
              {alert.vehicle.licensePlate ? (
                <span className="font-normal text-muted-foreground"> · {alert.vehicle.licensePlate}</span>
              ) : null}
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
  const navigate = useNavigate();
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
        <ErrorState error={query.error} />
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
                <AlertsTable items={items} onRowClick={(a) => navigate(`/vehicles/${a.vehicleId}`)} />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
