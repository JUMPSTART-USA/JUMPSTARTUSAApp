import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column, type ListState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect, unresolvedOptionLabel } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CHAPTER_STATES } from '@jumpstart/shared';
import { todayInput } from '@/lib/form';
import { P, useListParams } from '@/lib/list-params';
import { formatDate } from '@/lib/utils';
import { useCampaignOptions } from '../shared';
import type { EventRecord } from '../types';
import { EventFormDialog } from './EventFormDialog';
import { BackLink } from '@/components/BackLink';

const columns: Column<EventRecord>[] = [
  { key: 'name', header: 'Name', sortKey: 'name', render: (e) => <span className="font-medium">{e.name}</span> },
  { key: 'eventDate', header: 'Date', sortKey: 'eventDate', render: (e) => formatDate(e.eventDate) },
  { key: 'eventType', header: 'Type', sortKey: 'eventType', render: (e) => e.eventType ?? '—' },
  { key: 'location', header: 'Location', render: (e) => e.location ?? '—' },
  {
    key: 'chapterState',
    header: 'Chapter',
    sortKey: 'chapterState',
    render: (e) => <Badge variant="outline">{e.chapterState}</Badge>,
  },
  {
    key: 'campaign',
    header: 'Campaign',
    render: (e) =>
      e.campaign ? (
        <Link
          to={`/campaigns/${e.campaign.id}`}
          className="text-primary hover:underline"
          onClick={(ev) => ev.stopPropagation()}
        >
          {e.campaign.name}
        </Link>
      ) : (
        '—'
      ),
  },
  {
    key: 'registrations',
    header: 'Registrations',
    className: 'text-right',
    render: (e) => <span className="tabular-nums">{e._count?.registrations ?? 0}</span>,
  },
];

type EventTab = 'upcoming' | 'past';
const EVENT_TABS = ['upcoming', 'past'] as const;

export function EventsListPage() {
  const { can } = useAuth();
  /** Read first, in its own instance: the LIST's default sort depends on it. */
  const { values: tabValues, set: setTabParam } = useListParams({
    tab: P.choice(EVENT_TABS, 'upcoming'),
  });
  const tab: EventTab = tabValues.tab || 'upcoming';
  /**
   * The tab drives the SORT DIRECTION — upcoming reads soonest-first, past reads
   * most-recent-first — and it does so through the sort DEFAULT rather than by
   * writing a second key. Defaults are never written to the URL, so switching tabs
   * stays ONE write and no `?sort=` appears unless the user sorts a column himself;
   * if he has, that choice survives the switch, which is the right precedence.
   *
   * So this is not a patch() case after all, even though the tab changes more than
   * itself: nothing needs to land atomically because only one key moves.
   */
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      eventType: P.text(),
      campaignId: P.id(),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { sort: { by: 'eventDate', dir: tab === 'past' ? 'desc' : 'asc' } },
  );
  const [createOpen, setCreateOpen] = useState(false);
  const campaignOptions = useCampaignOptions();

  // Local calendar date, not the UTC one: after 8pm Eastern the UTC date is
  // already tomorrow, so this filter asked the server for events starting
  // tomorrow and today's remaining events dropped off the upcoming list.
  const today = todayInput();
  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: values.search,
    eventType: values.eventType,
    campaignId: values.campaignId,
    // Chapter filter (§7.2) — still sent as the `state` query param.
    state: values.state,
    from: tab === 'upcoming' ? today : undefined,
    to: tab === 'past' ? today : undefined,
  });
  const query = useQuery({
    queryKey: ['crm', 'events', 'list', params],
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
    queryFn: () => api.get<Paged<EventRecord>>(`/events${params}`),
  });

  /** One write: the tab. The sort follows from it through the default above. */
  const switchTab = (next: string) => setTabParam('tab', next as EventTab);

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Events"
        description="Fundraising and community events, registrations, and financials."
        actions={
          can('events.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New event
            </Button>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
      </Tabs>

      <ListToolbar>
        <SearchInput
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search name or location…"
        />
        <Input
          value={draft.eventType}
          onChange={(e) => set('eventType', e.target.value)}
          placeholder="Type…"
          className="w-full sm:w-36"
        />
        <FilterSelect
          aria-label="Campaign"
          value={values.campaignId}
          onChange={(value) => set('campaignId', value)}
          className="w-full sm:w-56"
        >
          <option value="">All campaigns</option>
          {unresolvedOptionLabel(values.campaignId, campaignOptions.data?.items, campaignOptions.isLoading) ? (
            <option value={values.campaignId}>
              {unresolvedOptionLabel(
                values.campaignId,
                campaignOptions.data?.items,
                campaignOptions.isLoading,
              )}
            </option>
          ) : null}
          {campaignOptions.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter filter (§7.2) — hidden for scoped users (the API forces
            their chapter). */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
      </ListToolbar>

      {query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}
      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        state={listState}
        onStateChange={onListStateChange}
        rowHref={(row) => `/events/${row.id}`}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage={tab === 'upcoming' ? 'No upcoming events' : 'No past events'}
      />

      <EventFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
