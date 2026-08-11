import { PROGRAM_TYPES } from '@jumpstart/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  const [listState, setListState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [programType, setProgramType] = useState('');
  const [status, setStatus] = useState('');
  const [state, setState] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setListState((s) => (s.page === 1 ? s : { ...s, page: 1 }));
  }, [debouncedSearch, programType, status, state]);

  const query = useQuery({
    queryKey: ['outside-programs', 'list', listState, debouncedSearch, programType, status, state],
    queryFn: () =>
      api.get<Paged<OutsideProgramRow>>(
        `/outside-programs${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: debouncedSearch,
          programType,
          status,
          state,
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
        <SearchInput
          placeholder="Search name, location, volunteer lead…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterSelect
          aria-label="Program type"
          value={programType}
          onChange={setProgramType}
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
          value={status}
          onChange={setStatus}
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
        <ChapterFilterSelect value={state} onChange={setState} />
      </ListToolbar>

      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}

      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        state={listState}
        onStateChange={setListState}
        rowHref={(row) => row.id}
        emptyMessage="No outside programs found"
      />

      <ProgramFormDialog open={createOpen} onOpenChange={setCreateOpen} program={null} />
    </div>
  );
}
