import { PLEDGE_STATUSES, PLEDGE_STATUS_LABELS } from '@jumpstart/shared';
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
  const navigate = useNavigate();
  const [state, setState] = useState<ListState>({
    page: 1,
    pageSize: 25,
    sortBy: 'pledgeDate',
    sortDir: 'desc',
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
    queryKey: ['crm', 'pledges', 'list', params],
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
        state={state}
        onStateChange={setState}
        onRowClick={(row) => navigate(`/donors/pledges/${row.id}`)}
        emptyMessage="No pledges found"
      />

      <PledgeFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
