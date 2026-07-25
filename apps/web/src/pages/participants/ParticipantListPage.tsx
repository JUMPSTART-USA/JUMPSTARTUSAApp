import {
  ALUMNI_STATUSES,
  INSIDE_STATUSES,
  OUTSIDE_STATUSES,
  US_STATES,
} from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, fullName, humanize } from '@/lib/utils';
import { useDebounced } from './shared';
import type { ParticipantListItem } from './types';

/** 'not_applicable' is the default in every status domain — noise as a badge. */
function statusCell(status: string) {
  if (status === 'not_applicable') return <span className="text-muted-foreground">—</span>;
  return <StatusBadge status={status} />;
}

const columns: Column<ParticipantListItem>[] = [
  {
    key: 'participantNumber',
    header: 'Number',
    sortKey: 'participantNumber',
    render: (row) => <span className="font-mono text-xs">{row.participantNumber}</span>,
  },
  {
    key: 'name',
    header: 'Name',
    sortKey: 'lastName',
    render: (row) => (
      <div>
        <div className="font-medium">{fullName(row.person)}</div>
        {row.person.city || row.person.state ? (
          <div className="text-xs text-muted-foreground">
            {[row.person.city, row.person.state].filter(Boolean).join(', ')}
          </div>
        ) : null}
      </div>
    ),
  },
  {
    key: 'insideStatus',
    header: 'Inside',
    sortKey: 'insideStatus',
    render: (row) => statusCell(row.insideStatus),
  },
  {
    key: 'outsideStatus',
    header: 'Outside',
    sortKey: 'outsideStatus',
    render: (row) => statusCell(row.outsideStatus),
  },
  {
    key: 'alumniStatus',
    header: 'Alumni',
    sortKey: 'alumniStatus',
    render: (row) => statusCell(row.alumniStatus),
  },
  {
    key: 'caseManager',
    header: 'Case manager',
    render: (row) =>
      row.assignedCaseManager ? (
        `${row.assignedCaseManager.firstName} ${row.assignedCaseManager.lastName}`
      ) : (
        <span className="text-muted-foreground">Unassigned</span>
      ),
  },
  {
    key: 'intakeDate',
    header: 'Intake',
    sortKey: 'intakeDate',
    render: (row) => formatDate(row.intakeDate),
  },
];

export function ParticipantListPage() {
  const navigate = useNavigate();
  const { user, can } = useAuth();

  const [listState, setListState] = useState<ListState>({ ...initialListState, sortBy: 'lastName' });
  const [search, setSearch] = useState('');
  const [insideStatus, setInsideStatus] = useState('');
  const [outsideStatus, setOutsideStatus] = useState('');
  const [alumniStatus, setAlumniStatus] = useState('');
  const [state, setState] = useState('');
  const [myCaseload, setMyCaseload] = useState(false);
  const debouncedSearch = useDebounced(search);

  // Any filter change resets to page 1 — otherwise the page can outrun the total.
  const filter = (apply: () => void) => {
    apply();
    setListState((s) => ({ ...s, page: 1 }));
  };

  const params = {
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: debouncedSearch || undefined,
    insideStatus: insideStatus || undefined,
    outsideStatus: outsideStatus || undefined,
    alumniStatus: alumniStatus || undefined,
    state: state || undefined,
    assignedCaseManagerId: myCaseload ? user?.id : undefined,
  };

  const query = useQuery({
    queryKey: ['participants', 'list', params],
    queryFn: () => api.get<Paged<ParticipantListItem>>(`/participants${qs(params)}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Participants</h1>
        {can('participants.create') ? (
          <Button onClick={() => navigate('new')}>
            <Plus className="h-4 w-4" /> New participant
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, number, phone, email…"
          value={search}
          onChange={(e) => filter(() => setSearch(e.target.value))}
          className="w-72"
        />
        <Select
          value={insideStatus}
          onChange={(e) => filter(() => setInsideStatus(e.target.value))}
          className="w-40"
        >
          <option value="">Inside: all</option>
          {INSIDE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select
          value={outsideStatus}
          onChange={(e) => filter(() => setOutsideStatus(e.target.value))}
          className="w-40"
        >
          <option value="">Outside: all</option>
          {OUTSIDE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select
          value={alumniStatus}
          onChange={(e) => filter(() => setAlumniStatus(e.target.value))}
          className="w-40"
        >
          <option value="">Alumni: all</option>
          {ALUMNI_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select
          value={state}
          onChange={(e) => filter(() => setState(e.target.value))}
          className="w-28"
        >
          <option value="">State: all</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={myCaseload}
            onChange={(e) => filter(() => setMyCaseload(e.target.checked))}
          />
          My caseload
        </label>
      </div>

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
          emptyMessage="No participants match these filters"
        />
      )}
    </div>
  );
}
