import { HIRING_STATUSES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Briefcase, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
import { humanize } from '@/lib/utils';
import { EmployerFormDialog } from './EmployerFormDialog';
import { HiringStatusBadge } from './shared';
import type { EmployerListItem } from './types';
import { BackLink } from '@/components/BackLink';

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
  // The employer's CHAPTER (§7.2), not the postal address state.
  {
    key: 'chapterState',
    header: 'Chapter',
    sortKey: 'chapterState',
    render: (row) => row.chapterState,
  },
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
      <BackLink stateOnly />
      <PageHeader
        title="Employers"
        actions={
          <>
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
          </>
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="Search name, contact, city…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
        />
        <FilterSelect
          aria-label="Hiring status"
          className="w-full sm:w-44"
          value={hiringStatus}
          onChange={(value) => {
            setHiringStatus(value);
            resetPage();
          }}
        >
          <option value="">All hiring statuses</option>
          {HIRING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        <Input
          className="w-full sm:w-44"
          placeholder="Industry"
          value={industry}
          onChange={(e) => {
            setIndustry(e.target.value);
            resetPage();
          }}
        />
        {/* Chapter filter (§7.2) — still sent as the `state` query param;
            hidden for scoped users (the API forces their chapter). */}
        <ChapterFilterSelect
          value={stateFilter}
          onChange={(value) => {
            setStateFilter(value);
            resetPage();
          }}
        />
      </ListToolbar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
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
