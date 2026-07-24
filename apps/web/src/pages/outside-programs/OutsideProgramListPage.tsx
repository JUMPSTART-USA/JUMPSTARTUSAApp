import { PROGRAM_TYPES, US_STATES } from '@jumpstart/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { ProgramFormDialog } from './ProgramFormDialog';
import { useDebounced } from './shared';
import type { OutsideProgramRow } from './types';

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
          <span className="ml-1 text-xs font-medium text-red-600">over</span>
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
  const navigate = useNavigate();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outside Programs</h1>
          <p className="text-sm text-muted-foreground">
            Community-side programming — classes, treatment, transitional support
          </p>
        </div>
        {can('outside_programs.create') ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Program
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, location, volunteer lead…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={programType}
          onChange={(e) => setProgramType(e.target.value)}
          className="w-44"
        >
          <option value="">All types</option>
          {PROGRAM_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="">All statuses</option>
          {(['active', 'inactive', 'completed'] as const).map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select value={state} onChange={(e) => setState(e.target.value)} className="w-28">
          <option value="">All states</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {query.error ? <ErrorState error={query.error} /> : null}

      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={(row) => navigate(row.id)}
        emptyMessage="No outside programs found"
      />

      <ProgramFormDialog open={createOpen} onOpenChange={setCreateOpen} program={null} />
    </div>
  );
}
