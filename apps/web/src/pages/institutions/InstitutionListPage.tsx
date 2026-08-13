import { CHAPTER_STATES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
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
    className: 'text-right tabular-nums',
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
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams({
    search: P.text(),
    state: P.choice(CHAPTER_STATES, ''),
    /** Tri-state: '' is "active and inactive", not "unset". */
    active: P.choice(['true', 'false'] as const, ''),
  });
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['institutions', 'list', listState, values],
    queryFn: () =>
      api.get<Paged<InstitutionListItem>>(
        `/institutions${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          // `values`, not `draft`: the query waits for typing to settle.
          search: values.search,
          state: values.state,
          active: values.active,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

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
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          placeholder="Search name, city, contact…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        {/* Facility state IS the chapter (§7.2) — the 50-state list offered
            states no institution can be in. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={values.active}
          onChange={(value) => set('active', value as 'true' | 'false' | '')}
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
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
          onStateChange={onListStateChange}
          rowHref={(row) => row.id}
          isFiltered={isFiltered}
          onClearFilters={clear}
          emptyMessage="No institutions found"
        />
      )}

      <InstitutionFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
