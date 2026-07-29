import { HOUSING_STATUSES } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import { Select } from '@/components/ui/input';
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
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
import { formatDate, fullName, humanize } from '@/lib/utils';
import { HomeFormDialog } from './HomeFormDialog';
import { OccupancyBar } from './HousingPage';
import { MoveInDialog } from './MoveInDialog';
import { MoveOutDialog } from './MoveOutDialog';
import { TransferDialog } from './TransferDialog';
import type { HomeDetail, HousingEnrollmentRow } from './types';

type EnrollmentWithName = { enrollment: HousingEnrollmentRow; name: string };

export function HomeDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveInOpen, setMoveInOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<EnrollmentWithName | null>(null);
  const [moveOutTarget, setMoveOutTarget] = useState<EnrollmentWithName | null>(null);
  const [deleteEnrollmentTarget, setDeleteEnrollmentTarget] =
    useState<EnrollmentWithName | null>(null);

  const [historyState, setHistoryState] = useState<ListState>({
    ...initialListState,
    sortBy: 'moveInDate',
    sortDir: 'desc',
  });
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const debouncedSearch = useDebounced(historySearch);

  useEffect(() => {
    setHistoryState((s) => (s.page === 1 ? s : { ...s, page: 1 }));
  }, [debouncedSearch, historyStatus]);

  const homeQuery = useQuery({
    queryKey: ['housing', 'home', id],
    queryFn: () => api.get<HomeDetail>(`/transitional-homes/${id}`),
  });

  const historyQuery = useQuery({
    queryKey: ['housing', 'home-history', id, historyState, debouncedSearch, historyStatus],
    queryFn: () =>
      api.get<Paged<HousingEnrollmentRow>>(
        `/housing-enrollments${qs({
          homeId: id,
          page: historyState.page,
          pageSize: historyState.pageSize,
          sortBy: historyState.sortBy,
          sortDir: historyState.sortDir,
          search: debouncedSearch,
          status: historyStatus,
        })}`,
      ),
  });

  const deleteHome = useMutation({
    mutationFn: () => api.delete(`/transitional-homes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['housing'] });
      navigate('/housing');
    },
  });

  const deleteEnrollment = useMutation({
    mutationFn: (enrollmentId: string) => api.delete(`/housing-enrollments/${enrollmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['housing'] });
      setDeleteEnrollmentTarget(null);
    },
  });

  if (homeQuery.isLoading) return <PageLoader />;
  if (homeQuery.error) return <ErrorState error={homeQuery.error} />;
  const home = homeQuery.data;
  if (!home) return <ErrorState error={new Error('Transitional home not found')} />;

  const occupied = home.enrollments.length;
  const canUpdate = can('housing.update');

  const historyColumns: Column<HousingEnrollmentRow>[] = [
    {
      key: 'participant',
      header: 'Participant',
      render: (e) => (
        <div>
          <div className="font-medium">{fullName(e.participantProfile.person)}</div>
          <div className="text-xs text-muted-foreground">
            {e.participantProfile.participantNumber}
          </div>
        </div>
      ),
    },
    {
      key: 'moveInDate',
      header: 'Move-in',
      sortKey: 'moveInDate',
      render: (e) => formatDate(e.moveInDate),
    },
    {
      key: 'moveOutDate',
      header: 'Move-out',
      sortKey: 'moveOutDate',
      render: (e) => formatDate(e.moveOutDate),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (e) => <StatusBadge status={e.status} />,
    },
    { key: 'reason', header: 'Reason', render: (e) => e.reasonForLeaving ?? '—' },
    {
      key: 'assessment',
      header: 'Assessment',
      render: (e) => <StatusBadge status={e.completionAssessment} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-20',
      render: (e) =>
        can('housing.delete') ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={(ev) => {
              ev.stopPropagation();
              setDeleteEnrollmentTarget({
                enrollment: e,
                name: fullName(e.participantProfile.person),
              });
            }}
          >
            Delete
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <BackLink fallbackTo="/housing" fallbackLabel="Housing" />
        <PageHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              {home.name}
              <StatusBadge status={home.active ? 'active' : 'inactive'} />
              {occupied > home.capacity ? (
                <Badge variant="destructive">over capacity</Badge>
              ) : null}
            </span>
          }
          description={[home.addressLine1, home.city, home.state, home.zip]
            .filter(Boolean)
            .join(', ')}
          actions={
            <>
              {can('housing.create') ? (
                <Button onClick={() => setMoveInOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Move in
                </Button>
              ) : null}
              {canUpdate ? (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              ) : null}
              {can('housing.delete') ? (
                <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Home details</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList columns={3}>
              <InfoItem label="Phone">{home.phone ?? '—'}</InfoItem>
              <InfoItem label="House manager">{home.houseManagerName ?? '—'}</InfoItem>
              <InfoItem label="Manager contact">
                {[home.houseManagerPhone, home.houseManagerEmail].filter(Boolean).join(' · ') ||
                  '—'}
              </InfoItem>
              <InfoItem label="Notes">{home.notes ?? '—'}</InfoItem>
            </DescriptionList>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Occupancy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-semibold">
              {occupied} <span className="text-base font-normal text-muted-foreground">of</span>{' '}
              {home.capacity}{' '}
              <span className="text-base font-normal text-muted-foreground">beds</span>
            </div>
            <OccupancyBar occupied={occupied} capacity={home.capacity} />
            <p className="text-xs text-muted-foreground">
              {home.capacity - occupied >= 0
                ? `${home.capacity - occupied} available`
                : `${occupied - home.capacity} over capacity`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current residents ({occupied})</CardTitle>
        </CardHeader>
        <CardContent>
          {occupied === 0 ? (
            <EmptyState title="No current residents" hint="Record a move-in to add a resident" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resident</TableHead>
                  <TableHead>Move-in</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {home.enrollments.map((e) => {
                  const name = fullName(e.participantProfile.person);
                  const row = {
                    ...e,
                    home: { id: home.id, name: home.name, state: home.state },
                  } as HousingEnrollmentRow;
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-medium">{name}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.participantProfile.participantNumber}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(e.moveInDate)}</TableCell>
                      <TableCell className="max-w-64 truncate">{e.notes ?? '—'}</TableCell>
                      <TableCell>
                        {canUpdate ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTransferTarget({ enrollment: row, name })}
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setMoveOutTarget({ enrollment: row, name })}
                            >
                              Move out
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrollment history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ListToolbar>
            <SearchInput
              placeholder="Search participant…"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            <Select
              value={historyStatus}
              onChange={(e) => setHistoryStatus(e.target.value)}
              className="w-full sm:w-44"
            >
              <option value="">All statuses</option>
              {HOUSING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </ListToolbar>
          {historyQuery.error ? <ErrorState error={historyQuery.error} /> : null}
          <DataTable
            columns={historyColumns}
            data={historyQuery.data}
            isLoading={historyQuery.isLoading}
            state={historyState}
            onStateChange={setHistoryState}
            onRowClick={
              canUpdate
                ? (row) =>
                    setMoveOutTarget({
                      enrollment: row,
                      name: fullName(row.participantProfile.person),
                    })
                : undefined
            }
            emptyMessage="No enrollment history for this home"
          />
        </CardContent>
      </Card>

      <HomeFormDialog open={editOpen} onOpenChange={setEditOpen} home={home} />
      <MoveInDialog open={moveInOpen} onOpenChange={setMoveInOpen} home={home} />
      <TransferDialog
        open={transferTarget !== null}
        onOpenChange={(o) => !o && setTransferTarget(null)}
        enrollment={transferTarget?.enrollment ?? null}
        residentName={transferTarget?.name ?? ''}
        currentHomeName={home.name}
      />
      <MoveOutDialog
        open={moveOutTarget !== null}
        onOpenChange={(o) => !o && setMoveOutTarget(null)}
        enrollment={moveOutTarget?.enrollment ?? null}
        residentName={moveOutTarget?.name ?? ''}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) deleteHome.reset();
        }}
        title="Delete home?"
        description="The home is soft-deleted and hidden from lists. Homes with current residents cannot be deleted — move them out or transfer them first."
        onConfirm={() => deleteHome.mutate()}
        isPending={deleteHome.isPending}
        error={deleteHome.error ? deleteHome.error.message : null}
      />
      <ConfirmDialog
        open={deleteEnrollmentTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteEnrollmentTarget(null);
            deleteEnrollment.reset();
          }
        }}
        title="Delete enrollment record?"
        description={`Deletion is for data errors only — exits are status changes so history is preserved. This removes ${
          deleteEnrollmentTarget?.name ?? 'the resident'
        }'s enrollment record.`}
        onConfirm={() =>
          deleteEnrollmentTarget && deleteEnrollment.mutate(deleteEnrollmentTarget.enrollment.id)
        }
        isPending={deleteEnrollment.isPending}
        error={deleteEnrollment.error ? deleteEnrollment.error.message : null}
      />
    </div>
  );
}
