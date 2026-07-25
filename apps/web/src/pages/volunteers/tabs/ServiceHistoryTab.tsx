import { useQuery } from '@tanstack/react-query';
import { Badge, StatusBadge } from '@/components/ui/badge';
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
import type { ServiceHistoryResult } from '../types';

/** §6.6 volunteer service report: where, when, in what role. */
export function ServiceHistoryTab({ volunteerProfileId }: { volunteerProfileId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['volunteers', 'service-history', volunteerProfileId],
    queryFn: () =>
      api.get<ServiceHistoryResult>(`/volunteers/${volunteerProfileId}/service-history`),
  });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const assignments = data?.assignments ?? [];

  if (assignments.length === 0) {
    return <EmptyState title="No service history" hint="Assignments will appear here as they are recorded." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Where</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignments.map((row) => {
          const place = [
            row.institution
              ? `${row.institution.name}${row.institution.state ? ` (${row.institution.state})` : ''}`
              : null,
            row.insideClass?.name,
            row.outsideProgram
              ? `${row.outsideProgram.name}${row.outsideProgram.programType ? ` · ${humanize(row.outsideProgram.programType)}` : ''}`
              : null,
            row.event
              ? `${row.event.name}${row.event.eventDate ? ` · ${formatDate(row.event.eventDate)}` : ''}`
              : null,
          ].filter(Boolean);
          return (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">
                {formatDate(row.startDate)}
                {' — '}
                {row.endDate ? formatDate(row.endDate) : 'present'}
              </TableCell>
              <TableCell>{humanize(row.assignmentType)}</TableCell>
              <TableCell>
                {place.length > 0 ? place.join(' — ') : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>{row.role ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={row.status} />
                  {row.clearanceOverride ? (
                    <Badge variant="warning" title={row.clearanceOverrideReason ?? undefined}>
                      Override
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
