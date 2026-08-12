import { CHAPTER_STATES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input, Label } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { formatDate, formatMoney, humanize } from '@/lib/utils';
import { useAppealOptions, useCampaignOptions, useFundOptions } from '../shared';
import type { Donation, DonationSummary } from '../types';
import { DonationFormDialog } from './DonationFormDialog';
import { DonorsNav } from './DonorsNav';
import { BackLink } from '@/components/BackLink';

export function AcknowledgedBadge({ acknowledgedAt }: { acknowledgedAt: string | null }) {
  return acknowledgedAt ? (
    <Badge variant="success">Acknowledged</Badge>
  ) : (
    <Badge variant="warning">Pending</Badge>
  );
}

const columns: Column<Donation>[] = [
  { key: 'donationDate', header: 'Date', sortKey: 'donationDate', render: (d) => formatDate(d.donationDate) },
  {
    key: 'donor',
    header: 'Donor',
    render: (d) =>
      d.donor ? (
        <Link
          to={`/donors/${d.donor.id}`}
          className="font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {d.donor.name}
        </Link>
      ) : (
        '—'
      ),
  },
  {
    key: 'amount',
    header: 'Amount',
    sortKey: 'amount',
    className: 'text-right',
    render: (d) => <span className="tabular-nums">{formatMoney(d.amount)}</span>,
  },
  { key: 'fund', header: 'Fund', render: (d) => d.fund?.name ?? '—' },
  {
    key: 'paymentMethod',
    header: 'Method',
    render: (d) => (d.paymentMethod ? humanize(d.paymentMethod) : '—'),
  },
  {
    key: 'isRecurring',
    header: 'Recurring',
    render: (d) => (d.isRecurring ? <Badge variant="info">Recurring</Badge> : '—'),
  },
  {
    key: 'campaign',
    header: 'Campaign',
    render: (d) =>
      d.campaign ? (
        <Link
          to={`/campaigns/${d.campaign.id}`}
          className="text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {d.campaign.name}
        </Link>
      ) : (
        '—'
      ),
  },
  {
    key: 'event',
    header: 'Event',
    render: (d) =>
      d.event ? (
        <Link
          to={`/events/${d.event.id}`}
          className="text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {d.event.name}
        </Link>
      ) : (
        '—'
      ),
  },
  {
    key: 'acknowledged',
    header: 'Acknowledged',
    render: (d) => <AcknowledgedBadge acknowledgedAt={d.acknowledgedAt} />,
  },
];

export function DonationsListPage() {
  const { can } = useAuth();
  /**
   * The widest list in the app: nine filters. P.id() for the three option-list ids,
   * because those are free-form values from a fetched list — there is no closed set
   * to validate against, unlike the chapter and the two boolean selects.
   */
  const { values, draft, set, listState, onListStateChange } = useListParams(
    {
      search: P.text(),
      state: P.choice(CHAPTER_STATES, ''),
      from: P.date(),
      to: P.date(),
      campaignId: P.id(),
      fundId: P.id(),
      appealId: P.id(),
      recurring: P.choice(['true', 'false'] as const, ''),
      acknowledged: P.choice(['true', 'false'] as const, ''),
    },
    { sort: { by: 'donationDate', dir: 'desc' } },
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Donation | null>(null);
  const campaignOptions = useCampaignOptions();
  const fundOptions = useFundOptions(false);
  const appealOptions = useAppealOptions(undefined, false);

  const filterParams = {
    search: values.search,
    state: values.state,
    from: values.from,
    to: values.to,
    campaignId: values.campaignId,
    fundId: values.fundId,
    appealId: values.appealId,
    isRecurring: values.recurring,
    acknowledged: values.acknowledged,
  };
  const listParams = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    ...filterParams,
  });
  const listQuery = useQuery({
    queryKey: ['crm', 'donations', 'list', listParams],
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
    queryFn: () => api.get<Paged<Donation>>(`/donations${listParams}`),
  });

  const summaryParams = qs(filterParams);
  const summaryQuery = useQuery({
    queryKey: ['crm', 'donations', 'summary', summaryParams],
    queryFn: () => api.get<DonationSummary>(`/donations/summary${summaryParams}`),
  });

  const dateFilter = (label: string, value: string, setValue: (v: string) => void) => (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-40"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Donations"
        description="Every gift on record — click a row to edit."
        actions={
          can('donors.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Record donation
            </Button>
          ) : null
        }
      />

      <DonorsNav />

      <ListToolbar>
        <SearchInput
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search donor name…"
        />
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
        {dateFilter('From', values.from, (v) => set('from', v))}
        {dateFilter('To', values.to, (v) => set('to', v))}
        <FilterSelect
          aria-label="Campaign"
          value={values.campaignId}
          onChange={(value) => set('campaignId', value)}
          className="w-full sm:w-56"
        >
          <option value="">All campaigns</option>
          {campaignOptions.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Fund"
          value={values.fundId}
          onChange={(value) => set('fundId', value)}
          className="w-full sm:w-44"
        >
          <option value="">All funds</option>
          {fundOptions.data?.items.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Appeal"
          value={values.appealId}
          onChange={(value) => set('appealId', value)}
          className="w-full sm:w-44"
        >
          <option value="">All appeals</option>
          {appealOptions.data?.items.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Acknowledgment"
          value={values.acknowledged}
          onChange={(value) => set('acknowledged', value as 'true' | 'false' | '')}
          className="w-full sm:w-44"
        >
          <option value="">All acknowledgments</option>
          <option value="true">Acknowledged</option>
          <option value="false">Not acknowledged</option>
        </FilterSelect>
        <FilterSelect
          aria-label="Gift type"
          value={values.recurring}
          onChange={(value) => set('recurring', value as 'true' | 'false' | '')}
          className="w-full sm:w-44"
        >
          <option value="">All gifts</option>
          <option value="true">Recurring</option>
          <option value="false">One-time</option>
        </FilterSelect>
      </ListToolbar>

      <Card>
        <CardContent className="flex flex-wrap items-baseline gap-x-8 gap-y-2 p-4">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <p className="text-xl font-semibold tabular-nums">
              {summaryQuery.isLoading ? '…' : formatMoney(summaryQuery.data?.total)}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Gifts
            </span>
            <p className="text-xl font-semibold tabular-nums">
              {summaryQuery.isLoading ? '…' : (summaryQuery.data?.count ?? '—')}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Average
            </span>
            <p className="text-xl font-semibold tabular-nums">
              {summaryQuery.isLoading ? '…' : formatMoney(summaryQuery.data?.average)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Totals reflect the filters above.</p>
        </CardContent>
      </Card>

      {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={listQuery.refetch} /> : null}
      <DataTable
        columns={columns}
        data={listQuery.data}
        isLoading={listQuery.isLoading}
        isFetching={listQuery.isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowOpen={can('donors.update') ? (row) => setEditing(row) : undefined}
        emptyMessage="No donations match these filters"
      />

      <DonationFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DonationFormDialog
        open={Boolean(editing)}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        donation={editing ?? undefined}
      />
    </div>
  );
}
