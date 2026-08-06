import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataTable, type Column, type ListState } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
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

export function EventsListPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<EventTab>('upcoming');
  const [state, setState] = useState<ListState>({
    page: 1,
    pageSize: 25,
    sortBy: 'eventDate',
    sortDir: 'asc',
  });
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);
  const debouncedType = useDebounced(eventType);
  const campaignOptions = useCampaignOptions();

  useEffect(() => {
    setState((s) => ({ ...s, page: 1 }));
  }, [debouncedSearch, debouncedType]);

  const today = new Date().toISOString().slice(0, 10);
  const params = qs({
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    search: debouncedSearch,
    eventType: debouncedType,
    campaignId,
    from: tab === 'upcoming' ? today : undefined,
    to: tab === 'past' ? today : undefined,
  });
  const query = useQuery({
    queryKey: ['crm', 'events', 'list', params],
    queryFn: () => api.get<Paged<EventRecord>>(`/events${params}`),
  });

  const switchTab = (next: string) => {
    const value = next as EventTab;
    setTab(value);
    setState((s) => ({
      ...s,
      page: 1,
      sortBy: 'eventDate',
      sortDir: value === 'upcoming' ? 'asc' : 'desc',
    }));
  };

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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or location…"
        />
        <Input
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          placeholder="Type…"
          className="w-full sm:w-36"
        />
        <Select
          value={campaignId}
          onChange={(e) => {
            setCampaignId(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
          className="w-full sm:w-56"
        >
          <option value="">All campaigns</option>
          {campaignOptions.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </ListToolbar>

      {query.isError ? <ErrorState error={query.error} /> : null}
      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        state={state}
        onStateChange={setState}
        onRowClick={(row) => navigate(`/events/${row.id}`)}
        emptyMessage={tab === 'upcoming' ? 'No upcoming events' : 'No past events'}
      />

      <EventFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
