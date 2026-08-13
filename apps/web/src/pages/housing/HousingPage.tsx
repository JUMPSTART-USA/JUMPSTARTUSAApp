import { CHAPTER_STATES, HOME_GENDER_LABELS, HOUSING_STATUSES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BedDouble, Plus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, cardClickNav } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { MetricCard } from '@/components/ui/stat';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { cn, formatDate, fullName, humanize } from '@/lib/utils';
import { Meter } from '@/components/ui/meter';
import { HomeFormDialog } from './HomeFormDialog';
import { MoveInDialog } from './MoveInDialog';
import type { HomeRow, HousingEnrollmentRow, OccupancyEntry } from './types';
import { BackLink } from '@/components/BackLink';

/**
 * Beds-used bar: green under, amber AT, red over capacity (§6.4 — surfaced, not
 * blocked).
 *
 * The thresholds stay here rather than in the kit's Meter because they are the
 * opposite of the fundraising ProgressBar's, which paints 100% green. A full
 * home is not an achievement, and a shared "100% is success" rule would paint an
 * over-capacity transitional home green.
 */
export function OccupancyBar({ occupied, capacity }: { occupied: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0;
  const tone = occupied > capacity ? 'destructive' : occupied === capacity ? 'warning' : 'success';
  return <Meter pct={pct} tone={tone} />;
}

function OccupancyDashboard() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['housing', 'occupancy'],
    queryFn: () => api.get<OccupancyEntry[]>('/transitional-homes/occupancy'),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const entries = query.data ?? [];
  if (entries.length === 0) {
    return <EmptyState title="No active homes" hint="Add a transitional home to see occupancy" />;
  }

  const totals = entries.reduce(
    (acc, e) => ({ capacity: acc.capacity + e.capacity, occupied: acc.occupied + e.occupied }),
    { capacity: 0, occupied: 0 },
  );
  const available = totals.capacity - totals.occupied;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Inert on purpose: these three total the homes listed directly below,
            so there is nowhere to click through TO. */}
        <MetricCard label="Total beds" value={totals.capacity} />
        <MetricCard label="Occupied" value={totals.occupied} />
        {/**
          * THIS ONE IS BAD WHEN NEGATIVE — the opposite direction from every
          * other flagged metric in the app, where the number is bad when it
          * GROWS. A pass that harmonises these onto one "over the threshold"
          * rule silently stops colouring the only case that matters here: more
          * residents than beds (§6.4 — over capacity is surfaced, not blocked).
          */}
        <MetricCard
          label="Available"
          value={available}
          flag={
            available < 0
              ? {
                  tone: 'destructive',
                  note: `${-available} bed${available === -1 ? '' : 's'} over capacity`,
                }
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/**
          * The card's click is pointer convenience; the REAL navigation is the
          * link on the home name. It used to be the other way round — onClick on
          * the Card with no tabIndex, no role, no key handler and nothing
          * focusable inside — so a keyboard user could not open a home from THIS
          * tab (WCAG 2.1.1). The Homes tab beside it was always reachable
          * through DataTable's rowHref; this is that same shape, by hand,
          * because these are cards rather than rows.
          */}
        {entries.map((entry) => (
          <Card
            key={entry.home.id}
            className="cursor-pointer transition-colors hover:border-primary/40"
            onClick={cardClickNav(() => navigate(`homes/${entry.home.id}`))}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>
                    <Link
                      to={`homes/${entry.home.id}`}
                      className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {entry.home.name}
                    </Link>
                  </CardTitle>
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
    className: 'w-48 tabular-nums',
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
  /**
   * ns 'homes': the Residents queue mounts on this same route and also filters by
   * `search`, so un-namespaced keys would have each typing into the other's box.
   *
   * The useEffect that reset the page on every filter change is gone — the hook
   * deletes the page key in the same URL write as the filter, so there is no
   * second render pass and no window showing page 3 of a new result set.
   */
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      state: P.choice(CHAPTER_STATES, ''),
      active: P.choice(['true', 'false'] as const, ''),
    },
    { ns: 'homes' },
  );

  const query = useQuery({
    queryKey: ['housing', 'homes', listState, values],
    queryFn: () =>
      api.get<Paged<HomeRow>>(
        `/transitional-homes${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: values.search,
          state: values.state,
          active: values.active,
        })}`,
      ),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-3">
      <ListToolbar>
        <SearchInput
          placeholder="Search name, city, house manager…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        {/* Home state IS the chapter (§7.2) — hidden for scoped users. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
        <FilterSelect
          aria-label="Home status"
          value={values.active}
          onChange={(v) => set('active', v as 'true' | 'false' | '')}
          className="w-full sm:w-44"
        >
          <option value="">All homes</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </FilterSelect>
      </ListToolbar>
      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}
      <DataTable chapterScoped
        columns={homeColumns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        state={listState}
        onStateChange={onListStateChange}
        rowHref={(row) => `homes/${row.id}`}
        isFiltered={isFiltered}
        onClearFilters={clear}
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
  /** ns 'residents': shares this route, and a `search` key, with the Homes queue. */
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      status: P.choice(HOUSING_STATUSES, ''),
    },
    { ns: 'residents', sort: { by: 'moveInDate', dir: 'desc' } },
  );

  const query = useQuery({
    queryKey: ['housing', 'enrollments', listState, values],
    queryFn: () =>
      api.get<Paged<HousingEnrollmentRow>>(
        `/housing-enrollments${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: values.search,
          status: values.status,
        })}`,
      ),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-3">
      <ListToolbar>
        <SearchInput
          placeholder="Search participant name or number…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Residency status"
          value={values.status}
          onChange={(v) => set('status', v as (typeof HOUSING_STATUSES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">All statuses</option>
          {HOUSING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>
      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}
      <DataTable chapterScoped
        columns={residentColumns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        state={listState}
        onStateChange={onListStateChange}
        rowHref={(row) => `homes/${row.homeId}`}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No housing enrollments found"
      />
    </div>
  );
}

/** The tab strip's values; anything else in ?tab= falls back to occupancy. */
const HOUSING_TABS = ['occupancy', 'homes', 'residents'] as const;
type HousingTab = (typeof HOUSING_TABS)[number];

export function HousingPage() {
  /** 'occupancy' is the default, so it is the value ABSENT from the URL. */
  const { values: tabValues, set: setTab, clear, isFiltered } = useListParams({
    tab: P.choice(HOUSING_TABS, 'occupancy'),
  });
  const tab = tabValues.tab || 'occupancy';
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

      {/**
        * Controlled from ?tab=: both queues below keep their page and filters in the
        * URL under their own namespace, so a restored ?residents.page=2 on a strip
        * that silently reset to Occupancy would hold page 2 of a list Radix has not
        * even mounted.
        */}
      <Tabs value={tab} onValueChange={(next) => setTab('tab', next as HousingTab)}>
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
