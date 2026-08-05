import { US_STATES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
import { InstitutionFormDialog } from './InstitutionFormDialog';
import type { InstitutionListItem } from './types';

const columns: Column<InstitutionListItem>[] = [
  {
    key: 'name',
    header: 'Name',
    sortKey: 'name',
    render: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    key: 'institutionType',
    header: 'Type',
    sortKey: 'institutionType',
    render: (row) => row.institutionType ?? '—',
  },
  { key: 'city', header: 'City', sortKey: 'city', render: (row) => row.city ?? '—' },
  { key: 'state', header: 'State', sortKey: 'state', render: (row) => row.state },
  {
    key: 'contacts',
    header: 'Contacts',
    render: (row) => {
      const first = row.contacts[0];
      if (!first) return <span className="text-muted-foreground">—</span>;
      return (
        <span>
          {first.name} <span className="text-xs text-muted-foreground">({first.role})</span>
          {row._count.contacts > 1 ? (
            <span className="text-xs text-muted-foreground"> +{row._count.contacts - 1}</span>
          ) : null}
        </span>
      );
    },
  },
  {
    key: 'classes',
    header: 'Classes',
    className: 'text-right',
    render: (row) => row._count.insideClasses,
  },
  {
    key: 'active',
    header: 'Status',
    render: (row) =>
      row.active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>,
  },
];

export function InstitutionListPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [listState, setListState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  const query = useQuery({
    queryKey: ['institutions', 'list', listState, debouncedSearch, stateFilter, activeFilter],
    queryFn: () =>
      api.get<Paged<InstitutionListItem>>(
        `/institutions${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: debouncedSearch,
          state: stateFilter,
          active: activeFilter,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const resetPage = () => setListState((s) => ({ ...s, page: 1 }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Institutions"
        actions={
          can('institutions.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New institution
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="Search name, city, contact…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
        />
        <Select
          className="w-full sm:w-44"
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
        <Select
          className="w-full sm:w-44"
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            resetPage();
          }}
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </ListToolbar>

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
          emptyMessage="No institutions found"
        />
      )}

      <InstitutionFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
