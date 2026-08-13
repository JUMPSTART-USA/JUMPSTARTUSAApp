import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CHAPTER_STATES,
  TRAVEL_REQUEST_STATUSES,
  TRAVEL_REQUEST_STATUS_LABELS,
} from '@jumpstart/shared';
import { backTo } from '@/components/BackLink';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FilterSelect } from '@/components/ui/filter-select';
import { SectionHeader } from '@/components/ui/page-header';
import { ErrorState, Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ListToolbar, ToolbarDateField } from '@/components/ui/toolbar';
import { ParticipantPicker, useParticipantOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { applyApiError } from '@/lib/form';
import { formatDate, fullName } from '@/lib/utils';
import {
  TravelDecisionDialog,
  TravelRequestFormDialog,
  formatTravelDates,
  type TravelRequestRow,
} from './travel-request-dialogs';

export { formatTravelDates, type TravelRequestRow };

export function TravelRequestsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { values, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      participantId: P.id(),
      status: P.choice(TRAVEL_REQUEST_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
      from: P.date(),
      to: P.date(),
    },
    { sort: { dir: 'desc' } },
  );
  /** The URL carries the id; this turns it back into the name on the chip. */
  const participant = useParticipantOption(values.participantId);
  const [formTarget, setFormTarget] = useState<TravelRequestRow | 'new' | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<TravelRequestRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TravelRequestRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canUpdate = can('case_management.update');
  const canDelete = can('case_management.delete');
  const canOpenParticipant = can('participants.read');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // The URL value, not the resolved option — see CaseNotesPage.
    participantProfileId: values.participantId,
    status: values.status,
    state: values.state,
    from: values.from,
    to: values.to,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['case-management', 'travel-requests', params],
    queryFn: () => api.get<Paged<TravelRequestRow>>(`/travel-requests${params}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/travel-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      setDeleteTarget(null);
    },
    onError: (err) => setDeleteError(applyApiError(err)),
  });

  const columns: Column<TravelRequestRow>[] = [
    {
      key: 'startDate',
      header: 'Dates',
      sortKey: 'startDate',
      render: (r) => formatTravelDates(r.startDate, r.endDate),
      className: 'whitespace-nowrap',
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (r) =>
        canOpenParticipant ? (
          <Link
            to={`/participants/${r.participantProfileId}`}
            {...backTo('/case-management/travel-requests', 'Travel requests')}
            className="font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fullName(r.participant.person)}
          </Link>
        ) : (
          fullName(r.participant.person)
        ),
    },
    {
      key: 'destination',
      header: 'Destination',
      sortKey: 'destination',
      render: (r) => r.destination,
    },
    {
      key: 'purpose',
      header: 'Purpose',
      render: (r) => <div className="max-w-xs truncate text-muted-foreground">{r.purpose}</div>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'decidedAt',
      header: 'Decided',
      sortKey: 'decidedAt',
      render: (r) => (r.decidedAt ? formatDate(r.decidedAt) : '—'),
      className: 'whitespace-nowrap',
    },
    ...(canUpdate || canDelete
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-10',
            render: (r: TravelRequestRow) => (
              <div className="flex items-center justify-end gap-1">
                {canUpdate && r.status === 'pending' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDecisionTarget(r);
                    }}
                  >
                    Review
                  </Button>
                ) : null}
                {canUpdate && r.status === 'approved' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDecisionTarget(r);
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
                {canUpdate && r.status === 'pending' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Edit travel request"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFormTarget(r);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete travel request"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteError(null);
                      setDeleteTarget(r);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ),
          } satisfies Column<TravelRequestRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Travel requests"
        actions={
          can('case_management.create') ? (
            <Button onClick={() => setFormTarget('new')}>
              <Plus className="h-4 w-4" /> New request
            </Button>
          ) : null
        }
      />

      {/* `set` deletes the page key in the same URL write, so none of these
          filters needs its own page-1 reset any more. */}
      <ListToolbar className="items-end">
        <div className="w-full sm:w-72">
          <ParticipantPicker
            {...participant}
            onChange={(p) => set('participantId', p?.id ?? '')}
          />
        </div>
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof TRAVEL_REQUEST_STATUSES)[number] | '')}
        >
          <option value="">All statuses</option>
          {TRAVEL_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TRAVEL_REQUEST_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): requests derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
        <ToolbarDateField
          label="From"
          value={values.from}
          onChange={(e) => set('from', e.target.value)}
        />
        <ToolbarDateField
          label="To"
          value={values.to}
          onChange={(e) => set('to', e.target.value)}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      <DataTable chapterScoped
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No travel requests"
      />

      <TravelRequestFormDialog
        request={formTarget}
        initialParticipant={participant.value}
        onClose={() => setFormTarget(null)}
      />
      <TravelDecisionDialog request={decisionTarget} onClose={() => setDecisionTarget(null)} />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        title="Delete travel request"
        description={
          deleteTarget
            ? `Delete the ${formatTravelDates(deleteTarget.startDate, deleteTarget.endDate)} travel request to ${deleteTarget.destination}?`
            : undefined
        }
        isPending={remove.isPending}
        error={deleteError}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}

/**
 * Compact travel-requests card for the participant profile Case Management
 * tab: the 5 most recent requests plus a New request action reusing
 * TravelRequestFormDialog in fixed-participant mode.
 */
export function TravelRequestsCard({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const [formTarget, setFormTarget] = useState<TravelRequestRow | 'new' | null>(null);

  const query = useQuery({
    queryKey: ['participants', participantId, 'travel-requests'],
    queryFn: () =>
      api.get<Paged<TravelRequestRow>>(
        `/travel-requests${qs({ participantProfileId: participantId, pageSize: 5, sortBy: 'startDate', sortDir: 'desc' })}`,
      ),
  });

  const requests = query.data?.items ?? [];

  return (
    <Card>
      <CardHeaderRow title="Travel requests">
        {can('case_management.create') ? (
          <Button variant="outline" size="sm" onClick={() => setFormTarget('new')}>
            <Plus className="h-3.5 w-3.5" /> New request
          </Button>
        ) : null}
      </CardHeaderRow>
      <CardContent>
        {query.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dates</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No travel requests
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatTravelDates(r.startDate, r.endDate)}
                    </TableCell>
                    <TableCell className="font-medium">{r.destination}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <TravelRequestFormDialog
        request={formTarget}
        initialParticipant={{ id: participantId, label: '' }}
        onClose={() => setFormTarget(null)}
      />
    </Card>
  );
}
