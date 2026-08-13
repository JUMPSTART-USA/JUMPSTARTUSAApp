import { CHAPTER_STATES } from '@jumpstart/shared';
import { PROGRAM_TYPES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { formatDate, humanize } from '@/lib/utils';
import { ProgramFormDialog } from './ProgramFormDialog';
import type { OutsideProgramRow } from './types';
import { BackLink } from '@/components/BackLink';

const columns: Column<OutsideProgramRow>[] = [
  {
    key: 'name',
    header: 'Name',
    sortKey: 'name',
    render: (p) => <span className="font-medium">{p.name}</span>,
  },
  {
    key: 'programType',
    header: 'Type',
    sortKey: 'programType',
    render: (p) => humanize(p.programType),
  },
  {
    key: 'location',
    header: 'Location',
    render: (p) => [p.location, p.state].filter(Boolean).join(', ') || '—',
  },
  {
    key: 'schedule',
    header: 'Schedule',
    render: (p) => p.recurringSchedule ?? '—',
  },
  {
    key: 'leads',
    header: 'Leads',
    render: (p) => {
      const staff = p.staffLead ? `${p.staffLead.firstName} ${p.staffLead.lastName}` : null;
      return [staff, p.volunteerLeadName].filter(Boolean).join(' / ') || '—';
    },
  },
  {
    key: 'enrollment',
    header: 'Enrolled',
    render: (p) => (
      <span>
        {p.activeEnrollmentCount}
        {p.capacity != null ? ` / ${p.capacity}` : ''}
        {p.capacity != null && p.activeEnrollmentCount > p.capacity ? (
          <span className="ml-1 text-xs font-medium text-destructive">over</span>
        ) : null}
      </span>
    ),
  },
  {
    key: 'startDate',
    header: 'Start',
    sortKey: 'startDate',
    render: (p) => formatDate(p.startDate),
  },
  {
    key: 'status',
    header: 'Status',
    sortKey: 'status',
    render: (p) => <StatusBadge status={p.status} />,
  },
];

export function OutsideProgramListPage() {
  const { can } = useAuth();
  const { values, draft, set, listState, onListStateChange } = useListParams({
    search: P.text(),
    programType: P.choice(PROGRAM_TYPES, ''),
    status: P.choice(['active', 'inactive', 'completed'] as const, ''),
    state: P.choice(CHAPTER_STATES, ''),
  });
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['outside-programs', 'list', listState, values],
    queryFn: () =>
      api.get<Paged<OutsideProgramRow>>(
        `/outside-programs${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          // `values`, not `draft`: the query waits for typing to settle.
          search: values.search,
          programType: values.programType,
          status: values.status,
          state: values.state,
        })}`,
      ),
  });

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Outside Programs"
        description="Community-side programming — classes, treatment, transitional support"
        actions={
          can('outside_programs.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New program
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          placeholder="Search name, location, volunteer lead…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Program type"
          value={values.programType}
          onChange={(value) => set('programType', value as (typeof PROGRAM_TYPES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">All types</option>
          {PROGRAM_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Status"
          value={values.status}
          onChange={(value) => set('status', value as 'active' | 'inactive' | 'completed' | '')}
          className="w-full sm:w-44"
        >
          <option value="">All statuses</option>
          {(['active', 'inactive', 'completed'] as const).map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): hidden for scoped users — the API force-filters their chapter. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
      </ListToolbar>

      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}

      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        state={listState}
        onStateChange={onListStateChange}
        rowHref={(row) => row.id}
        emptyMessage="No outside programs found"
      />

      <ProgramFormDialog open={createOpen} onOpenChange={setCreateOpen} program={null} />
    </div>
  );
}
