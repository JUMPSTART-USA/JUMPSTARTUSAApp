import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDate, humanize } from '@/lib/utils';
import { SeverityBadge, vehicleLabel } from './shared';
import type { AlertSeverity, VehicleAlert } from './types';

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
  const query = useQuery({
    queryKey: ['fleet', 'alerts'],
    queryFn: () => api.get<{ items: VehicleAlert[]; total: number }>('/vehicles/alerts'),
  });

  if (query.isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link
          to="/vehicles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Vehicles
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Fleet alerts</h1>
        <p className="text-sm text-muted-foreground">
          Maintenance due, registration and insurance expirations across active vehicles.
        </p>
      </div>

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
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle>{title}</CardTitle>
                  <SeverityBadge severity={severity} />
                  <span className="text-sm text-muted-foreground">{items.length}</span>
                </div>
                <p className="text-sm text-muted-foreground">{hint}</p>
              </CardHeader>
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
