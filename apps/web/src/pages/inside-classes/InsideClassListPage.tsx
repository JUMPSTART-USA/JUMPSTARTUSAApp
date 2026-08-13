import { CHAPTER_STATES } from '@jumpstart/shared';
import { CLASS_STATUSES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect, unresolvedOptionLabel } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
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
    className: 'text-right tabular-nums',
    render: (row) => row._count.enrollments,
  },
];

export function InsideClassListPage() {
  const { can } = useAuth();
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams({
    search: P.text(),
    institutionId: P.id(),
    state: P.choice(CHAPTER_STATES, ''),
    status: P.choice(CLASS_STATUSES, ''),
  });
  const [createOpen, setCreateOpen] = useState(false);
  const institutionOptions = useInstitutionOptions();

  const query = useQuery({
    queryKey: ['inside-classes', 'list', listState, values],
    queryFn: () =>
      api.get<Paged<InsideClassListItem>>(
        `/inside-classes${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          // `values`, not `draft`: the query waits for typing to settle.
          search: values.search,
          institutionId: values.institutionId,
          state: values.state,
          status: values.status,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

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
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          placeholder="Search class name or type…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Institution"
          className="w-full sm:w-56"
          value={values.institutionId}
          onChange={(value) => set('institutionId', value)}
        >
          <option value="">All institutions</option>
          {/* The options are capped and permission-gated, so an id from a link
              may be absent. Must be a DIRECT child; see filter-select.tsx. */}
          {unresolvedOptionLabel(values.institutionId, institutionOptions.data?.items, institutionOptions.isLoading) ? (
            <option value={values.institutionId}>
              {unresolvedOptionLabel(values.institutionId, institutionOptions.data?.items, institutionOptions.isLoading)}
            </option>
          ) : null}
          {institutionOptions.data?.items.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name} ({inst.state})
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): classes derive chapter via institution.state;
            hidden for scoped users — the API force-filters their chapter. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof CLASS_STATUSES)[number] | '')}
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
        <DataTable chapterScoped
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          state={listState}
          onStateChange={onListStateChange}
          rowHref={(row) => row.id}
          isFiltered={isFiltered}
          onClearFilters={clear}
          emptyMessage="No classes found"
        />
      )}

      <InsideClassFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
