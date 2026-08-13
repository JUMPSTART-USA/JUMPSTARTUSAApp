import { CHAPTER_STATES, PLEDGE_STATUSES, PLEDGE_STATUS_LABELS } from '@jumpstart/shared';
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
import { ListToolbar } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { P, useListParams } from '@/lib/list-params';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/utils';
import { DonorPicker, useDonorOption } from '../shared';
import type { PledgeListItem } from '../types';
import { DonorsNav } from './DonorsNav';
import { PledgeFormDialog } from './PledgeFormDialog';
import { BackLink } from '@/components/BackLink';

const columns: Column<PledgeListItem>[] = [
  {
    key: 'donor',
    header: 'Donor',
    render: (p) => <span className="font-medium">{p.donor?.name ?? '—'}</span>,
  },
  { key: 'pledgeDate', header: 'Date', sortKey: 'pledgeDate', render: (p) => formatDate(p.pledgeDate) },
  {
    key: 'totalAmount',
    header: 'Total',
    sortKey: 'totalAmount',
    className: 'text-right',
    render: (p) => <span className="tabular-nums">{formatMoney(p.totalAmount)}</span>,
  },
  {
    key: 'amountPaid',
    header: 'Paid',
    className: 'text-right',
    render: (p) => <span className="tabular-nums">{formatMoney(p.amountPaid)}</span>,
  },
  {
    key: 'balance',
    header: 'Balance',
    className: 'text-right',
    render: (p) => <span className="tabular-nums">{formatMoney(p.balance)}</span>,
  },
  {
    key: 'percentPaid',
    header: '%',
    className: 'text-right',
    render: (p) => <span className="tabular-nums">{Math.round(p.percentPaid)}%</span>,
  },
  {
    key: 'status',
    header: 'Status',
    sortKey: 'status',
    render: (p) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={p.status} />
        {p.inArrears && p.status === 'active' ? (
          <Badge variant="warning">In arrears</Badge>
        ) : null}
      </span>
    ),
  },
];

export function PledgesListPage() {
  const { can } = useAuth();
  const { values, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      donorId: P.id(),
      status: P.choice(PLEDGE_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { sort: { by: 'pledgeDate', dir: 'desc' } },
  );
  /** The URL carries the id; this turns it back into the name on the chip. */
  const donor = useDonorOption(values.donorId);
  const [createOpen, setCreateOpen] = useState(false);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    status: values.status,
    state: values.state,
    // The URL value, not the resolved option: the list filters on what the link
    // asked for even while the name is still loading, so a restored link never
    // flashes every pledge before narrowing.
    donorId: values.donorId,
  });
  const query = useQuery({
    queryKey: ['crm', 'pledges', 'list', params],
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
    queryFn: () => api.get<Paged<PledgeListItem>>(`/pledges${params}`),
  });

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Pledges"
        description="Giving commitments and payment schedules."
        actions={
          can('donors.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New pledge
            </Button>
          ) : null
        }
      />

      <DonorsNav />

      <ListToolbar>
        <div className="w-full sm:w-72">
          {/* `set` deletes the page key in the same write, so the explicit
              page-1 reset the useState version needed is gone. */}
          <DonorPicker
            {...donor}
            onChange={(d) => set('donorId', d?.id ?? '')}
            placeholder="Filter by donor…"
          />
        </div>
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
        <FilterSelect
          aria-label="Status"
          value={values.status}
          onChange={(value) => set('status', value as (typeof PLEDGE_STATUSES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">All statuses</option>
          {PLEDGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PLEDGE_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      {query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}
      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        state={listState}
        onStateChange={onListStateChange}
        rowHref={(row) => `/donors/pledges/${row.id}`}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No pledges found"
      />

      <PledgeFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
