import { HOME_GENDER_LABELS, HOUSING_STATUSES } from '@jumpstart/shared';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, Plus, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
import { cn, formatDate, fullName, humanize } from '@/lib/utils';
import { HomeFormDialog } from './HomeFormDialog';
import { MoveInDialog } from './MoveInDialog';
import type { HomeRow, HousingEnrollmentRow, OccupancyEntry } from './types';
import { BackLink } from '@/components/BackLink';

/** Beds-used bar: green under, amber at, red over capacity (§6.4 surfaced, not blocked). */
export function OccupancyBar({ occupied, capacity }: { occupied: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0;
  const over = occupied > capacity;
  const full = occupied === capacity;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          'h-full rounded-full transition-all',
          over ? 'bg-destructive' : full ? 'bg-warning' : 'bg-success',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function OccupancyDashboard() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['housing', 'occupancy'],
    queryFn: () => api.get<OccupancyEntry[]>('/transitional-homes/occupancy'),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.error) return <ErrorState error={query.error} />;
  const entries = query.data ?? [];
  if (entries.length === 0) {
    return <EmptyState title="No active homes" hint="Add a transitional home to see occupancy" />;
  }

  const totals = entries.reduce(
    (acc, e) => ({ capacity: acc.capacity + e.capacity, occupied: acc.occupied + e.occupied }),
    { capacity: 0, occupied: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total beds
            </div>
            <div className="mt-1 text-2xl font-semibold">{totals.capacity}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Occupied
            </div>
            <div className="mt-1 text-2xl font-semibold">{totals.occupied}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Available
            </div>
            <div
              className={cn(
                'mt-1 text-2xl font-semibold',
                totals.capacity - totals.occupied < 0 && 'text-destructive',
              )}
            >
              {totals.capacity - totals.occupied}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <Card
            key={entry.home.id}
            className="cursor-pointer transition-colors hover:border-primary/40"
            onClick={() => navigate(`homes/${entry.home.id}`)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{entry.home.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[entry.home.city, entry.home.state].filter(Boolean).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap text-sm">
                  <BedDouble className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {entry.occupied} / {entry.capacity}
                  </span>
                  {entry.available < 0 ? (
                    <Badge variant="destructive">over capacity</Badge>
                  ) : null}
                </div>
              </div>
              <OccupancyBar occupied={entry.occupied} capacity={entry.capacity} />
            </CardHeader>
            <CardContent className="pt-0">
              {entry.currentResidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No current residents</p>
              ) : (
                <ul className="space-y-1">
                  {entry.currentResidents.map((r) => (
                    <li
                      key={r.enrollmentId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        {fullName(r)}{' '}
                        <span className="text-xs text-muted-foreground">
                          {r.participantNumber}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        since {formatDate(r.moveInDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

const homeColumns: Column<HomeRow>[] = [
  {
    key: 'name',
    header: 'Name',
    sortKey: 'name',
    render: (h) => <span className="font-medium">{h.name}</span>,
  },
  { key: 'city', header: 'City', sortKey: 'city', render: (h) => h.city ?? '—' },
  { key: 'state', header: 'State', sortKey: 'state', render: (h) => h.state },
  { key: 'gender', header: 'Gender', render: (h) => HOME_GENDER_LABELS[h.gender] },
  {
    key: 'sexOffenderApproved',
    header: 'Sex offenders',
    render: (h) =>
      h.sexOffenderApproved ? <Badge variant="outline">Approved</Badge> : '—',
  },
  { key: 'manager', header: 'House manager', render: (h) => h.houseManagerName ?? '—' },
  {
    key: 'occupancy',
    header: 'Occupancy',
    sortKey: 'capacity',
    className: 'w-48',
    render: (h) => (
      <div className="space-y-1">
        <div className="text-xs">
          {h.occupied} / {h.capacity}
          {h.available < 0 ? (
            <span className="ml-1 font-medium text-destructive">over</span>
          ) : null}
        </div>
        <OccupancyBar occupied={h.occupied} capacity={h.capacity} />
      </div>
    ),
  },
  {
    key: 'active',
    header: 'Status',
    render: (h) => <StatusBadge status={h.active ? 'active' : 'inactive'} />,
  },
];

function HomesTab() {
  const navigate = useNavigate();
  const [listState, setListState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [active, setActive] = useState('');
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setListState((s) => (s.page === 1 ? s : { ...s, page: 1 }));
  }, [debouncedSearch, state, active]);

  const query = useQuery({
    queryKey: ['housing', 'homes', listState, debouncedSearch, state, active],
    queryFn: () =>
      api.get<Paged<HomeRow>>(
        `/transitional-homes${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: debouncedSearch,
          state,
          active,
        })}`,
      ),
  });

  return (
    <div className="space-y-3">
      <ListToolbar>
        <SearchInput
          placeholder="Search name, city, house manager…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {/* Home state IS the chapter (§7.2) — hidden for scoped users. */}
        <ChapterFilterSelect value={state} onChange={setState} />
        <Select
          aria-label="Home status"
          value={active}
          onChange={(e) => setActive(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All homes</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </Select>
      </ListToolbar>
      {query.error ? <ErrorState error={query.error} /> : null}
      <DataTable
        columns={homeColumns}
        data={query.data}
        isLoading={query.isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={(row) => navigate(`homes/${row.id}`)}
        emptyMessage="No transitional homes found"
      />
    </div>
  );
}

const residentColumns: Column<HousingEnrollmentRow>[] = [
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
    key: 'home',
    header: 'Home',
    render: (e) => `${e.home.name} (${e.home.state})`,
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
];

function ResidentsTab() {
  const navigate = useNavigate();
  const [listState, setListState] = useState<ListState>({
    ...initialListState,
    sortBy: 'moveInDate',
    sortDir: 'desc',
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setListState((s) => (s.page === 1 ? s : { ...s, page: 1 }));
  }, [debouncedSearch, status]);

  const query = useQuery({
    queryKey: ['housing', 'enrollments', listState, debouncedSearch, status],
    queryFn: () =>
      api.get<Paged<HousingEnrollmentRow>>(
        `/housing-enrollments${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: debouncedSearch,
          status,
        })}`,
      ),
  });

  return (
    <div className="space-y-3">
      <ListToolbar>
        <SearchInput
          placeholder="Search participant name or number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Residency status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
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
      {query.error ? <ErrorState error={query.error} /> : null}
      <DataTable
        columns={residentColumns}
        data={query.data}
        isLoading={query.isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={(row) => navigate(`homes/${row.homeId}`)}
        emptyMessage="No housing enrollments found"
      />
    </div>
  );
}

export function HousingPage() {
  const { can } = useAuth();
  const [newHomeOpen, setNewHomeOpen] = useState(false);
  const [moveInOpen, setMoveInOpen] = useState(false);

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Housing"
        description="Transitional homes, occupancy and resident history"
        actions={
          can('housing.create') ? (
            <>
              <Button variant="outline" onClick={() => setMoveInOpen(true)}>
                <UserPlus className="h-4 w-4" /> Move in
              </Button>
              <Button onClick={() => setNewHomeOpen(true)}>
                <Plus className="h-4 w-4" /> New home
              </Button>
            </>
          ) : null
        }
      />

      <Tabs defaultValue="occupancy">
        <TabsList>
          <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
          <TabsTrigger value="homes">Homes</TabsTrigger>
          <TabsTrigger value="residents">Residents</TabsTrigger>
        </TabsList>
        <TabsContent value="occupancy">
          <OccupancyDashboard />
        </TabsContent>
        <TabsContent value="homes">
          <HomesTab />
        </TabsContent>
        <TabsContent value="residents">
          <ResidentsTab />
        </TabsContent>
      </Tabs>

      <HomeFormDialog open={newHomeOpen} onOpenChange={setNewHomeOpen} home={null} />
      <MoveInDialog open={moveInOpen} onOpenChange={setMoveInOpen} home={null} />
    </div>
  );
}
