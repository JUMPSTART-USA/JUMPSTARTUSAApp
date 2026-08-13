import { CHAPTER_STATES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { formatDate, formatMoney, humanize } from '@/lib/utils';
import { ProgressBar } from '../shared';
import type { CampaignListItem, CampaignStatus } from '../types';
import { CampaignFormDialog } from './CampaignFormDialog';
import { BackLink } from '@/components/BackLink';

const CAMPAIGN_STATUSES: CampaignStatus[] = ['planned', 'active', 'completed', 'canceled'];

const columns: Column<CampaignListItem>[] = [
  { key: 'name', header: 'Name', sortKey: 'name', render: (c) => <span className="font-medium">{c.name}</span> },
  {
    key: 'chapterState',
    header: 'Chapter',
    sortKey: 'chapterState',
    render: (c) => <Badge variant="outline">{c.chapterState}</Badge>,
  },
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
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      status: P.choice(CAMPAIGN_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
  );
  const [createOpen, setCreateOpen] = useState(false);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: values.search,
    status: values.status,
    // Chapter filter (§7.2) — still sent as the `state` query param.
    state: values.state,
  });
  const query = useQuery({
    queryKey: ['crm', 'campaigns', 'list', params],
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
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
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search campaigns…"
        />
        <FilterSelect
          aria-label="Status"
          value={values.status}
          onChange={(value) => set('status', value as (typeof CAMPAIGN_STATUSES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">All statuses</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
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
      <DataTable chapterScoped
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        state={listState}
        onStateChange={onListStateChange}
        rowHref={(row) => `/campaigns/${row.id}`}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No campaigns found"
      />

      <CampaignFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
