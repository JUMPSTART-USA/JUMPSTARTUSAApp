import { HIRING_STATUSES, US_STATES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Briefcase, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/utils';
import { EmployerFormDialog } from './EmployerFormDialog';
import { HiringStatusBadge, useDebounced } from './shared';
import type { EmployerListItem } from './types';

const columns: Column<EmployerListItem>[] = [
  {
    key: 'name',
    header: 'Name',
    sortKey: 'name',
    render: (row) => <span className="font-medium">{row.name}</span>,
  },
  { key: 'contactPerson', header: 'Contact', render: (row) => row.contactPerson ?? '—' },
  { key: 'industry', header: 'Industry', sortKey: 'industry', render: (row) => row.industry ?? '—' },
  { key: 'city', header: 'City', sortKey: 'city', render: (row) => row.city ?? '—' },
  { key: 'state', header: 'State', sortKey: 'state', render: (row) => row.state ?? '—' },
  {
    key: 'hiringStatus',
    header: 'Hiring status',
    sortKey: 'hiringStatus',
    render: (row) => <HiringStatusBadge status={row.hiringStatus} />,
  },
  {
    key: 'placements',
    header: 'Placements',
    className: 'text-right',
    render: (row) => row._count.employments,
  },
];

export function EmployersListPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [listState, setListState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [hiringStatus, setHiringStatus] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);
  const debouncedIndustry = useDebounced(industry);

  const query = useQuery({
    queryKey: [
      'employers',
      'list',
      listState,
      debouncedSearch,
      debouncedIndustry,
      hiringStatus,
      stateFilter,
    ],
    queryFn: () =>
      api.get<Paged<EmployerListItem>>(
        `/employers${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: debouncedSearch,
          industry: debouncedIndustry,
          hiringStatus,
          state: stateFilter,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const resetPage = () => setListState((s) => ({ ...s, page: 1 }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Employers</h1>
        <div className="flex items-center gap-2">
          {can('employment.read') ? (
            <Button variant="outline" onClick={() => navigate('/employers/employments')}>
              <Briefcase className="h-4 w-4" /> Placements
            </Button>
          ) : null}
          {can('employers.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New employer
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Search name, contact, city…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
        />
        <Select
          className="w-44"
          value={hiringStatus}
          onChange={(e) => {
            setHiringStatus(e.target.value);
            resetPage();
          }}
        >
          <option value="">All hiring statuses</option>
          {HIRING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Input
          className="w-44"
          placeholder="Industry"
          value={industry}
          onChange={(e) => {
            setIndustry(e.target.value);
            resetPage();
          }}
        />
        <Select
          className="w-32"
          value={stateFilter}
          onChange={(e) => {
            setStateFilter(e.target.value);
            resetPage();
          }}
        >
          <option value="">All states</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
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
          emptyMessage="No employers found"
        />
      )}

      <EmployerFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
