import { CHAPTER_STATES, GIFT_FREQUENCY_LABELS, RECURRING_GIFT_STATUSES, RECURRING_GIFT_STATUS_LABELS } from '@jumpstart/shared';
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
import type { RecurringGiftListItem } from '../types';
import { DonorsNav } from './DonorsNav';
import { RecurringGiftFormDialog } from './RecurringGiftFormDialog';
import { BackLink } from '@/components/BackLink';

const columns: Column<RecurringGiftListItem>[] = [
  {
    key: 'donor',
    header: 'Donor',
    render: (g) => <span className="font-medium">{g.donor?.name ?? '—'}</span>,
  },
  {
    key: 'amount',
    header: 'Amount',
    sortKey: 'amount',
    className: 'text-right',
    render: (g) => <span className="tabular-nums">{formatMoney(g.amount)}</span>,
  },
  {
    key: 'frequency',
    header: 'Frequency',
    render: (g) => GIFT_FREQUENCY_LABELS[g.frequency] ?? g.frequency,
  },
  {
    key: 'nextGiftDate',
    header: 'Next gift',
    sortKey: 'nextGiftDate',
    render: (g) => (
      <span className="flex flex-wrap items-center gap-1.5">
        {formatDate(g.nextGiftDate)}
        {g.isOverdue ? <Badge variant="warning">Overdue</Badge> : null}
      </span>
    ),
  },
  { key: 'lastPaymentDate', header: 'Last payment', render: (g) => formatDate(g.lastPaymentDate) },
  {
    key: 'totalGiven',
    header: 'Total given',
    className: 'text-right',
    render: (g) => <span className="tabular-nums">{formatMoney(g.totalGiven)}</span>,
  },
  { key: 'status', header: 'Status', sortKey: 'status', render: (g) => <StatusBadge status={g.status} /> },
];

export function RecurringGiftsPage() {
  const { can } = useAuth();
  const { values, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      donorId: P.id(),
      status: P.choice(RECURRING_GIFT_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { sort: { by: 'nextGiftDate', dir: 'asc' } },
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
    // The URL value, not the resolved option — see PledgesListPage.
    donorId: values.donorId,
  });
  const query = useQuery({
    queryKey: ['crm', 'recurring-gifts', 'list', params],
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
    queryFn: () => api.get<Paged<RecurringGiftListItem>>(`/recurring-gifts${params}`),
  });

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Recurring gifts"
        description="Ongoing gift schedules and their payment activity."
        actions={
          can('donors.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New recurring gift
            </Button>
          ) : null
        }
      />

      <DonorsNav />

      <ListToolbar>
        <div className="w-full sm:w-72">
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
          onChange={(value) => set('status', value as (typeof RECURRING_GIFT_STATUSES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">All statuses</option>
          {RECURRING_GIFT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RECURRING_GIFT_STATUS_LABELS[s]}
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
        rowHref={(row) => `/donors/recurring/${row.id}`}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No recurring gifts found"
      />

      <RecurringGiftFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
