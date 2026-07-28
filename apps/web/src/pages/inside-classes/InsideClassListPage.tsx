import { CLASS_STATUSES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { InsideClassFormDialog } from './InsideClassFormDialog';
import { useDebounced, useInstitutionOptions } from './helpers';
import type { InsideClassListItem } from './types';
import { BackLink } from '@/components/BackLink';

const columns: Column<InsideClassListItem>[] = [
  {
    key: 'name',
    header: 'Class',
    sortKey: 'name',
    render: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    key: 'institution',
    header: 'Institution',
    render: (row) => `${row.institution.name} (${row.institution.state})`,
  },
  {
    key: 'classType',
    header: 'Type',
    sortKey: 'classType',
    render: (row) => row.classType ?? '—',
  },
  {
    key: 'startDate',
    header: 'Start',
    sortKey: 'startDate',
    render: (row) => formatDate(row.startDate),
  },
  { key: 'endDate', header: 'End', sortKey: 'endDate', render: (row) => formatDate(row.endDate) },
  {
    key: 'status',
    header: 'Status',
    sortKey: 'status',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'enrolled',
    header: 'Enrolled',
    className: 'text-right',
    render: (row) => row._count.enrollments,
  },
];

export function InsideClassListPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [listState, setListState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);
  const institutionOptions = useInstitutionOptions();

  const query = useQuery({
    queryKey: [
      'inside-classes',
      'list',
      listState,
      debouncedSearch,
      institutionFilter,
      statusFilter,
    ],
    queryFn: () =>
      api.get<Paged<InsideClassListItem>>(
        `/inside-classes${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: debouncedSearch,
          institutionId: institutionFilter,
          status: statusFilter,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const resetPage = () => setListState((s) => ({ ...s, page: 1 }));

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Inside Classes</h1>
        {can('inside_classes.create') ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New class
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Search class name or type…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
        />
        <Select
          className="w-64"
          value={institutionFilter}
          onChange={(e) => {
            setInstitutionFilter(e.target.value);
            resetPage();
          }}
        >
          <option value="">All institutions</option>
          {institutionOptions.data?.items.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name} ({inst.state})
            </option>
          ))}
        </Select>
        <Select
          className="w-44"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            resetPage();
          }}
        >
          <option value="">All statuses</option>
          {CLASS_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          state={listState}
          onStateChange={setListState}
          onRowClick={(row) => navigate(row.id)}
          emptyMessage="No classes found"
        />
      )}

      <InsideClassFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
