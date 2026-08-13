import {
  CHAPTER_STATES,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_LABELS,
} from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { BackLink } from '@/components/BackLink';
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
import { useDebounced } from '@/lib/form';
import { OpportunityFormDialog } from './OpportunityFormDialog';
import { OpportunityStatusBadge, formatHours } from './shared';
import type { OpportunityListItem } from './types';

/** Where the opportunity happens: institution / program / event / free-text. */
function linkedTo(row: OpportunityListItem) {
  const parts = [row.institution?.name, row.outsideProgram?.name, row.event?.name].filter(Boolean);
  if (parts.length > 0) return <span>{parts.join(' · ')}</span>;
  return <span className="text-muted-foreground">—</span>;
}

export function OpportunitiesListPage() {
  const { can } = useAuth();

  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      status: P.choice(OPPORTUNITY_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { sort: { by: 'name' } },
  );
  const [createOpen, setCreateOpen] = useState(false);

  const params = {
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // `values`, not `draft`: the query waits for typing to settle.
    search: values.search,
    status: values.status,
    state: values.state,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['volunteers', 'opportunities', params],
    queryFn: () => api.get<Paged<OpportunityListItem>>(`/volunteers/opportunities${qs(params)}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const columns: Column<OpportunityListItem>[] = [
    {
      key: 'name',
      header: 'Name',
      sortKey: 'name',
      render: (row) => (
        <div>
          <span className="font-medium">{row.name}</span>
          {row.location ? (
            <span className="block text-xs text-muted-foreground">{row.location}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (row) => <OpportunityStatusBadge status={row.status} />,
    },
    {
      key: 'linkedTo',
      header: 'Linked to',
      render: linkedTo,
    },
    {
      key: 'upcomingShifts',
      header: 'Upcoming shifts',
      render: (row) => (
        <span>
          {row.upcomingShiftCount}
          <span className="text-muted-foreground"> of {row.shiftCount}</span>
        </span>
      ),
    },
    {
      key: 'signups',
      className: 'text-right tabular-nums',
      header: 'Signups',
      render: (row) => <span>{row.signupCount}</span>,
    },
    {
      key: 'approvedHours',
      header: 'Approved hours',
      render: (row) => <span>{formatHours(row.approvedHours)}</span>,
    },
    {
      key: 'state',
      header: 'Chapter',
      render: (row) =>
        row.state ? <Badge variant="outline">{row.state}</Badge> : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <BackLink fallbackTo="/volunteers" fallbackLabel="Volunteers" />
      <PageHeader
        title="Volunteer opportunities"
        description="Shift-based opportunities volunteers sign up for — hours roll up per opportunity."
        actions={
          can('volunteers.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New opportunity
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          placeholder="Search name or location…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof OPPORTUNITY_STATUSES)[number] | '')}
        >
          <option value="">All statuses</option>
          {OPPORTUNITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {OPPORTUNITY_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      <DataTable chapterScoped
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        rowHref={(row) => `/volunteers/opportunities/${row.id}`}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No opportunities found"
      />

      <OpportunityFormDialog opportunity={null} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
