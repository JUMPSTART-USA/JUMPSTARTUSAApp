import { CHAPTER_STATES, HIRING_STATUSES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Briefcase, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
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
    className: 'text-right tabular-nums',
    render: (row) => row._count.employments,
  },
];

export function EmployersListPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams({
    search: P.text(),
    /** Free text, not a choice: industries are typed, not enumerated. */
    industry: P.text(),
    hiringStatus: P.choice(HIRING_STATUSES, ''),
    state: P.choice(CHAPTER_STATES, ''),
  });
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['employers', 'list', listState, values],
    queryFn: () =>
      api.get<Paged<EmployerListItem>>(
        `/employers${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          // `values`, not `draft`: the query waits for typing to settle.
          search: values.search,
          industry: values.industry,
          hiringStatus: values.hiringStatus,
          state: values.state,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

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
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          placeholder="Search name, contact, city…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Hiring status"
          className="w-full sm:w-44"
          value={values.hiringStatus}
          onChange={(value) => set('hiringStatus', value as (typeof HIRING_STATUSES)[number] | '')}
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
          value={draft.industry}
          onChange={(e) => set('industry', e.target.value)}
        />
        {/* Chapter filter (§7.2) — still sent as the `state` query param;
            hidden for scoped users (the API forces their chapter). */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
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
          emptyMessage="No employers found"
        />
      )}

      <EmployerFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
