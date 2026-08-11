import { HOURS_STATUSES, HOURS_STATUS_LABELS } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { VolunteerPicker, type PickerOption } from '@/components/pickers';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, ToolbarDateField } from '@/components/ui/toolbar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, qs, type Paged } from '@/lib/api';
import { endOfMonthInput, todayInput } from '@/lib/form';
import { useAuth } from '@/lib/auth';
import { formatDate, fullName } from '@/lib/utils';
import { LogHoursDialog } from './LogHoursDialog';
import { HoursSourceBadge, formatHours } from './shared';
import type { HoursEntryRow, HoursSummary } from './types';

function volunteerCell(row: HoursEntryRow) {
  if (!row.volunteerProfile) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      to={`/volunteers/${row.volunteerProfile.id}`}
      onClick={(e) => e.stopPropagation()}
      className="font-medium text-primary hover:underline"
    >
      {fullName(row.volunteerProfile.person)}
    </Link>
  );
}

export function HoursPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);

  // ── Summary tiles ─────────────────────────────────────────────────────────
  const year = new Date().getFullYear();
  // yyyy-MM from the LOCAL date. Taken off the UTC date, this rolled to the
  // next month at 8pm Eastern on the last evening of a month, so the tile
  // reported the wrong month's hours.
  const month = todayInput().slice(0, 7);
  /**
   * Two server aggregates, one request each, in parallel.
   *
   * These tiles were computed in the browser: page through every approved YTD
   * entry (pageSize caps at 200) and sum. For a chapter with 3,000 entries that
   * was 15 strictly serial round trips and megabytes of JSON to render two
   * numbers — and it stopped at 50 pages, so past 10,000 entries the tiles
   * undercounted silently. GET /volunteers/hours/summary answers from one Prisma
   * aggregate over the same filters (and the same chapter scoping) as the list.
   */
  const monthParams = qs({
    status: 'approved',
    from: `${month}-01`,
    to: endOfMonthInput(month),
  });
  const ytdParams = qs({ status: 'approved', from: `${year}-01-01` });
  const monthSummary = useQuery({
    queryKey: ['volunteers', 'hours', 'summary', monthParams],
    queryFn: () => api.get<HoursSummary>(`/volunteers/hours/summary${monthParams}`),
  });
  const ytdSummary = useQuery({
    queryKey: ['volunteers', 'hours', 'summary', ytdParams],
    queryFn: () => api.get<HoursSummary>(`/volunteers/hours/summary${ytdParams}`),
  });
  const pendingQuery = useQuery({
    queryKey: ['volunteers', 'hours', 'pending-queue'],
    queryFn: () =>
      api.get<Paged<HoursEntryRow>>(
        `/volunteers/hours${qs({ status: 'pending', pageSize: 100, sortBy: 'activityDate', sortDir: 'asc' })}`,
      ),
  });
  const monthTotal = monthSummary.data?.totalHours ?? 0;
  const ytdTotal = ytdSummary.data?.totalHours ?? 0;

  // ── Approve / reject ──────────────────────────────────────────────────────
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      api.patch(`/volunteers/hours/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['volunteers'] }),
  });

  // ── All entries ───────────────────────────────────────────────────────────
  const [listState, setListState] = useState<ListState>({
    ...initialListState,
    sortBy: 'activityDate',
    sortDir: 'desc',
  });
  const [volunteer, setVolunteer] = useState<PickerOption | null>(null);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = {
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    volunteerProfileId: volunteer?.id,
    status,
    from,
    to,
  };
  const entries = useQuery({
    queryKey: ['volunteers', 'hours', 'list', params],
    queryFn: () => api.get<Paged<HoursEntryRow>>(`/volunteers/hours${qs(params)}`),
  });

  const columns: Column<HoursEntryRow>[] = [
    { key: 'volunteer', header: 'Volunteer', render: volunteerCell },
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
            onClick={(e) => e.stopPropagation()}
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

  const pending = pendingQuery.data?.items ?? [];
  const canReview = can('volunteers.update');

  return (
    <div className="space-y-4">
      <BackLink fallbackTo="/volunteers" fallbackLabel="Volunteers" />
      <PageHeader
        title="Volunteer hours"
        description="Approved service hours, plus self-reported entries awaiting review."
        actions={
          can('volunteers.create') ? (
            <Button onClick={() => setLogOpen(true)}>
              <Plus className="h-4 w-4" /> Log hours
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-3 text-center sm:grid-cols-3">
        <div>
          <p className="text-2xl font-semibold">{formatHours(monthTotal)}</p>
          <p className="text-xs text-muted-foreground">Approved this month</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{formatHours(ytdTotal)}</p>
          <p className="text-xs text-muted-foreground">Approved this year</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{pendingQuery.data?.total ?? 0}</p>
          <p className="text-xs text-muted-foreground">Pending approval</p>
        </div>
      </div>

      <Card>
        <CardHeaderRow
          title="Pending approval"
          description="Self-reported and flagged entries — approve to count them toward totals."
        />
        <CardContent className="p-0 pb-2">
          {pendingQuery.error ? (
            <div className="px-5 pb-3">
              <ErrorState error={pendingQuery.error} onRetry={pendingQuery.refetch} />
            </div>
          ) : pending.length === 0 ? (
            <p className="px-5 pb-3 text-sm text-muted-foreground">
              All caught up — nothing awaiting approval.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Volunteer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  {canReview ? <TableHead className="text-right">Review</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{volunteerCell(row)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(row.activityDate)}
                    </TableCell>
                    <TableCell className="font-medium">{formatHours(row.hours)}</TableCell>
                    <TableCell>
                      {row.opportunity?.name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {row.description ? (
                        <span className="block max-w-56 truncate" title={row.description}>
                          {row.description}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <HoursSourceBadge source={row.source} />
                    </TableCell>
                    {canReview ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={review.isPending}
                            onClick={() => review.mutate({ id: row.id, status: 'approved' })}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={review.isPending}
                            onClick={() => review.mutate({ id: row.id, status: 'rejected' })}
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="All entries" />
        <CardContent className="space-y-3">
          <ListToolbar className="items-end">
            <div className="w-full sm:w-72">
              <VolunteerPicker
                value={volunteer}
                onChange={(v) => {
                  setVolunteer(v);
                  setListState((s) => ({ ...s, page: 1 }));
                }}
              />
            </div>
            <FilterSelect
              aria-label="Status"
              className="w-full sm:w-44"
              value={status}
              onChange={(value) => {
                setStatus(value);
                setListState((s) => ({ ...s, page: 1 }));
              }}
            >
              <option value="">All statuses</option>
              {HOURS_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {HOURS_STATUS_LABELS[s]}
                </option>
              ))}
            </FilterSelect>
            <ToolbarDateField
              label="From"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setListState((s) => ({ ...s, page: 1 }));
              }}
            />
            <ToolbarDateField
              label="To"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setListState((s) => ({ ...s, page: 1 }));
              }}
            />
          </ListToolbar>

          {entries.error ? <ErrorState error={entries.error} onRetry={entries.refetch} /> : null}

          <DataTable
            columns={columns}
            data={entries.data}
            isLoading={entries.isLoading}
            state={listState}
            onStateChange={setListState}
            emptyMessage="No hours entries found"
          />
        </CardContent>
      </Card>

      <LogHoursDialog open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
}
