import { CLASS_STATUSES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { InsideClassFormDialog } from './InsideClassFormDialog';
import { classTypeLabel, useInstitutionOptions } from './helpers';
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
    render: (row) => classTypeLabel(row.classType),
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
  const [listState, setListState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
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
      stateFilter,
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
          state: stateFilter,
          status: statusFilter,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const resetPage = () => setListState((s) => ({ ...s, page: 1 }));

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Inside Classes"
        actions={
          can('inside_classes.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New class
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="Search class name or type…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
        />
        <FilterSelect
          aria-label="Institution"
          className="w-full sm:w-56"
          value={institutionFilter}
          onChange={(value) => {
            setInstitutionFilter(value);
            resetPage();
          }}
        >
          <option value="">All institutions</option>
          {institutionOptions.data?.items.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name} ({inst.state})
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): classes derive chapter via institution.state;
            hidden for scoped users — the API force-filters their chapter. */}
        <ChapterFilterSelect
          value={stateFilter}
          onChange={(v) => {
            setStateFilter(v);
            resetPage();
          }}
        />
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            resetPage();
          }}
        >
          <option value="">All statuses</option>
          {CLASS_STATUSES.map((s) => (
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
          state={listState}
          onStateChange={setListState}
          rowHref={(row) => row.id}
          emptyMessage="No classes found"
        />
      )}

      <InsideClassFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
