import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney, humanize } from '@/lib/utils';
import { ProgressBar, useDebouncedValue } from '../shared';
import type { CampaignListItem, CampaignStatus } from '../types';
import { CampaignFormDialog } from './CampaignFormDialog';

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
  const debouncedSearch = useDebouncedValue(search);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Fundraising campaigns with raised-to-date computed from mirrored gifts.
          </p>
        </div>
        {can('campaigns.create') ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns…"
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
          className="w-40"
        >
          <option value="">All statuses</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>

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
