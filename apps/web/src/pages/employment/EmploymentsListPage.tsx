import { EMPLOYMENT_STATUSES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
import { formatDate, formatMoney, humanize } from '@/lib/utils';
import { EmploymentFormDialog } from './EmploymentFormDialog';
import { EmploymentStatusBadge, PAY_SUFFIX } from './shared';
import type { EmployerListItem, EmploymentListItem } from './types';
import { BackLink } from '@/components/BackLink';

export function EmploymentsListPage() {
  const { can } = useAuth();
  const canPay = can('fields.pay.read');
  const canUpdate = can('employment.update');
  const [listState, setListState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [employerId, setEmployerId] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EmploymentListItem | null>(null);
  const debouncedSearch = useDebounced(search);

  const employersQuery = useQuery({
    queryKey: ['employers', 'options'],
    queryFn: () =>
      api.get<Paged<EmployerListItem>>(`/employers${qs({ pageSize: 200, sortBy: 'name' })}`),
    enabled: can('employers.read'),
  });

  const query = useQuery({
    queryKey: ['employments', 'list', listState, debouncedSearch, employerId, status],
    queryFn: () =>
      api.get<Paged<EmploymentListItem>>(
        `/employments${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: debouncedSearch,
          employerId,
          status,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<Column<EmploymentListItem>[]>(() => {
    const cols: Column<EmploymentListItem>[] = [
      {
        key: 'participant',
        header: 'Participant',
        render: (row) => (
          <span className="font-medium">
            {row.participantProfile.person.firstName} {row.participantProfile.person.lastName}{' '}
            <span className="font-normal text-muted-foreground">
              · {row.participantProfile.participantNumber}
            </span>
          </span>
        ),
      },
      { key: 'employer', header: 'Employer', render: (row) => row.employer.name },
      { key: 'jobTitle', header: 'Job title', sortKey: 'jobTitle', render: (row) => row.jobTitle },
      {
        key: 'status',
        header: 'Status',
        sortKey: 'status',
        render: (row) => <EmploymentStatusBadge status={row.status} />,
      },
      {
        key: 'startDate',
        header: 'Start',
        sortKey: 'startDate',
        render: (row) => formatDate(row.startDate),
      },
      {
        key: 'endDate',
        header: 'End',
        sortKey: 'endDate',
        render: (row) => formatDate(row.endDate),
      },
    ];
    if (canPay) {
      // §7.2 pay field class — rendered only with fields.pay.read; the API
      // strips the values for everyone else.
      cols.push(
        {
          key: 'pay',
          header: 'Pay',
          className: 'text-right',
          render: (row) =>
            row.payRate == null ? (
              '—'
            ) : (
              <span>
                {formatMoney(row.payRate)}
                <span className="text-muted-foreground">
                  {PAY_SUFFIX[row.payPeriod ?? ''] ?? ''}
                </span>
              </span>
            ),
        },
        {
          key: 'hours',
          header: 'Hrs/wk',
          className: 'text-right',
          render: (row) => row.hoursPerWeek ?? '—',
        },
      );
    }
    if (canUpdate) {
      cols.push({
        key: 'actions',
        header: '',
        className: 'w-10 text-right',
        render: (row) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit employment"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(row);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ),
      });
    }
    return cols;
  }, [canPay, canUpdate]);

  const resetPage = () => setListState((s) => ({ ...s, page: 1 }));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <BackLink fallbackTo="/employers" fallbackLabel="Employers" />
        <PageHeader
          title="Placements"
          actions={
            can('employment.create') ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New placement
              </Button>
            ) : undefined
          }
        />
      </div>

      <ListToolbar>
        <SearchInput
          placeholder="Search participant, employer, title…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
        />
        <FilterSelect
          aria-label="Employer"
          className="w-full sm:w-56"
          value={employerId}
          onChange={(value) => {
            setEmployerId(value);
            resetPage();
          }}
        >
          <option value="">All employers</option>
          {employersQuery.data?.items.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={status}
          onChange={(value) => {
            setStatus(value);
            resetPage();
          }}
        >
          <option value="">All statuses</option>
          {EMPLOYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          state={listState}
          onStateChange={setListState}
          emptyMessage="No employment records found"
        />
      )}

      <EmploymentFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EmploymentFormDialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        employment={editing ?? undefined}
      />
    </div>
  );
}
