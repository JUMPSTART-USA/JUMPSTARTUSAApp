import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
import { formatDate, formatMoney, humanize } from '@/lib/utils';
import { ProgressBar } from '../shared';
import type { CampaignListItem, CampaignStatus } from '../types';
import { CampaignFormDialog } from './CampaignFormDialog';
import { BackLink } from '@/components/BackLink';

const CAMPAIGN_STATUSES: CampaignStatus[] = ['planned', 'active', 'completed', 'canceled'];

const columns: Column<CampaignListItem>[] = [
  { key: 'name', header: 'Name', sortKey: 'name', render: (c) => <span className="font-medium">{c.name}</span> },
  { key: 'status', header: 'Status', sortKey: 'status', render: (c) => <StatusBadge status={c.status} /> },
  { key: 'startDate', header: 'Start', sortKey: 'startDate', render: (c) => formatDate(c.startDate) },
  { key: 'endDate', header: 'End', sortKey: 'endDate', render: (c) => formatDate(c.endDate) },
  {
    key: 'goalAmount',
    header: 'Goal',
    sortKey: 'goalAmount',
    className: 'text-right',
    render: (c) => <span className="tabular-nums">{formatMoney(c.goalAmount)}</span>,
  },
  {
    key: 'raisedToDate',
    header: 'Raised',
    className: 'text-right',
    render: (c) => <span className="tabular-nums">{formatMoney(c.raisedToDate)}</span>,
  },
  { key: 'progress', header: 'Progress', render: (c) => <ProgressBar pct={c.progressPct} /> },
];

export function CampaignsListPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setState((s) => ({ ...s, page: 1 }));
  }, [debouncedSearch]);

  const params = qs({
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    search: debouncedSearch,
    status,
  });
  const query = useQuery({
    queryKey: ['crm', 'campaigns', 'list', params],
    queryFn: () => api.get<Paged<CampaignListItem>>(`/campaigns${params}`),
  });

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Campaigns"
        description="Fundraising campaigns with raised-to-date computed from recorded gifts."
        actions={
          can('campaigns.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New campaign
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns…"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
          className="w-full sm:w-44"
        >
          <option value="">All statuses</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
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
        onRowClick={(row) => navigate(`/campaigns/${row.id}`)}
        emptyMessage="No campaigns found"
      />

      <CampaignFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
