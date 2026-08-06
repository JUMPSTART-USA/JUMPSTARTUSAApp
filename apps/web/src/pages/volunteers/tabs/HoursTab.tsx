import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { LogHoursDialog } from '../LogHoursDialog';
import { HoursSourceBadge, formatHours } from '../shared';
import type { HoursEntryRow, VolunteerHoursSummary } from '../types';

/** Volunteer detail → Hours tab: totals, entry history, staff log dialog. */
export function HoursTab({
  volunteerProfileId,
  volunteerName,
  summary,
}: {
  volunteerProfileId: string;
  volunteerName: string;
  summary?: VolunteerHoursSummary;
}) {
  const { can } = useAuth();
  const [listState, setListState] = useState<ListState>({
    ...initialListState,
    sortBy: 'activityDate',
    sortDir: 'desc',
  });
  const [logOpen, setLogOpen] = useState(false);

  const params = { ...listState, volunteerProfileId };
  const { data, isLoading, error } = useQuery({
    queryKey: ['volunteers', 'hours', 'by-volunteer', params],
    queryFn: () => api.get<Paged<HoursEntryRow>>(`/volunteers/hours${qs(params)}`),
  });

  const columns: Column<HoursEntryRow>[] = [
    {
      key: 'activityDate',
      header: 'Date',
      sortKey: 'activityDate',
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.activityDate)}</span>,
    },
    {
      key: 'hours',
      header: 'Hours',
      sortKey: 'hours',
      render: (row) => <span className="font-medium">{formatHours(row.hours)}</span>,
    },
    {
      key: 'opportunity',
      header: 'Opportunity',
      render: (row) =>
        row.opportunity ? (
          <Link
            to={`/volunteers/opportunities/${row.opportunity.id}`}
            className="text-primary hover:underline"
          >
            {row.opportunity.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: 'source', header: 'Source', render: (row) => <HoursSourceBadge source={row.source} /> },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) =>
        row.description ? (
          <span className="block max-w-56 truncate" title={row.description}>
            {row.description}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {summary ? (
          <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 px-4 py-2 text-center">
            <div>
              <p className="text-xl font-semibold">{formatHours(summary.totalApproved)}</p>
              <p className="text-xs text-muted-foreground">Approved total</p>
            </div>
            <div>
              <p className="text-xl font-semibold">{formatHours(summary.ytdApproved)}</p>
              <p className="text-xs text-muted-foreground">This year</p>
            </div>
            <div>
              <p className="text-xl font-semibold">{summary.pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
        ) : (
          <span />
        )}
        {can('volunteers.create') ? (
          <Button onClick={() => setLogOpen(true)}>
            <Plus className="h-4 w-4" /> Log hours
          </Button>
        ) : null}
      </div>

      {error ? <ErrorState error={error} /> : null}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        emptyMessage="No hours recorded yet"
      />

      <LogHoursDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        volunteer={{ id: volunteerProfileId, label: volunteerName }}
      />
    </div>
  );
}
