import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type Column, type ListState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/utils';
import { useCampaignOptions, useDebouncedValue } from '../shared';
import type { Donation, DonationSummary } from '../types';
import { DonationFormDialog } from './DonationFormDialog';
import { DonorsNav } from './DonorsNav';

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
  { key: 'fund', header: 'Fund', render: (d) => d.fund ?? '—' },
  { key: 'paymentMethod', header: 'Method', render: (d) => d.paymentMethod ?? '—' },
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
];

export function DonationsListPage() {
  const { can } = useAuth();
  const [state, setState] = useState<ListState>({
    page: 1,
    pageSize: 25,
    sortBy: 'donationDate',
    sortDir: 'desc',
  });
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [fund, setFund] = useState('');
  const [recurring, setRecurring] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const debouncedFund = useDebouncedValue(fund);
  const campaignOptions = useCampaignOptions();

  useEffect(() => {
    setState((s) => ({ ...s, page: 1 }));
  }, [debouncedSearch, debouncedFund]);

  const listParams = qs({
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    search: debouncedSearch,
    from,
    to,
    campaignId,
    fund: debouncedFund,
    isRecurring: recurring,
  });
  const listQuery = useQuery({
    queryKey: ['crm', 'donations', 'list', listParams],
    queryFn: () => api.get<Paged<Donation>>(`/donations${listParams}`),
  });

  // GET /donations/summary supports from/to/campaignId (not fund/recurring).
  const summaryParams = qs({ from, to, campaignId });
  const summaryQuery = useQuery({
    queryKey: ['crm', 'donations', 'summary', summaryParams],
    queryFn: () => api.get<DonationSummary>(`/donations/summary${summaryParams}`),
  });

  const dateFilter = (
    label: string,
    value: string,
    setValue: (v: string) => void,
  ) => (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="date"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState((s) => ({ ...s, page: 1 }));
        }}
        className="w-40"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Donations</h1>
          <p className="text-sm text-muted-foreground">
            Gift history mirrored from Bloomerang.
          </p>
        </div>
        {can('donors.create') ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Record donation
          </Button>
        ) : null}
      </div>

      <DonorsNav active="donations" />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search donor name…"
          className="max-w-[220px]"
        />
        {dateFilter('From', from, setFrom)}
        {dateFilter('To', to, setTo)}
        <Select
          value={campaignId}
          onChange={(e) => {
            setCampaignId(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
          className="w-48"
        >
          <option value="">All campaigns</option>
          {campaignOptions.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input
          value={fund}
          onChange={(e) => setFund(e.target.value)}
          placeholder="Fund…"
          className="w-36"
        />
        <Select
          value={recurring}
          onChange={(e) => {
            setRecurring(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
          className="w-36"
        >
          <option value="">All gifts</option>
          <option value="true">Recurring</option>
          <option value="false">One-time</option>
        </Select>
      </div>

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
          <p className="text-xs text-muted-foreground">
            Totals reflect the date range and campaign filters.
          </p>
        </CardContent>
      </Card>

      {listQuery.isError ? <ErrorState error={listQuery.error} /> : null}
      <DataTable
        columns={columns}
        data={listQuery.data}
        isLoading={listQuery.isLoading}
        state={state}
        onStateChange={setState}
        emptyMessage="No donations match these filters"
      />

      <DonationFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
