import {
  GIFT_FREQUENCY_LABELS,
  RECURRING_GIFT_STATUSES,
  RECURRING_GIFT_STATUS_LABELS,
} from '@jumpstart/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column, type ListState } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type PickerOption } from '@/components/ui/entity-picker';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/utils';
import { DonorPicker } from '../shared';
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
  const navigate = useNavigate();
  const [state, setState] = useState<ListState>({
    page: 1,
    pageSize: 25,
    sortBy: 'nextGiftDate',
    sortDir: 'asc',
  });
  const [status, setStatus] = useState('');
  const [chapter, setChapter] = useState('');
  const [donor, setDonor] = useState<PickerOption | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const params = qs({
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    status,
    state: chapter,
    donorId: donor?.id,
  });
  const query = useQuery({
    queryKey: ['crm', 'recurring-gifts', 'list', params],
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
            value={donor}
            onChange={(d) => {
              setDonor(d);
              setState((s) => ({ ...s, page: 1 }));
            }}
            placeholder="Filter by donor…"
          />
        </div>
        <ChapterFilterSelect
          value={chapter}
          onChange={(value) => {
            setChapter(value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        />
        <FilterSelect
          aria-label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setState((s) => ({ ...s, page: 1 }));
          }}
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

      {query.isError ? <ErrorState error={query.error} /> : null}
      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        state={state}
        onStateChange={setState}
        onRowClick={(row) => navigate(`/donors/recurring/${row.id}`)}
        emptyMessage="No recurring gifts found"
      />

      <RecurringGiftFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
