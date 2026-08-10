import { OPPORTUNITY_STATUSES, OPPORTUNITY_STATUS_LABELS } from '@jumpstart/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { BackLink } from '@/components/BackLink';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
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

  const [listState, setListState] = useState<ListState>({ ...initialListState, sortBy: 'name' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [chapter, setChapter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  const params = {
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: debouncedSearch,
    status,
    state: chapter,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['volunteers', 'opportunities', params],
    queryFn: () => api.get<Paged<OpportunityListItem>>(`/volunteers/opportunities${qs(params)}`),
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
        <SearchInput
          placeholder="Search name or location…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {OPPORTUNITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {OPPORTUNITY_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        <ChapterFilterSelect
          value={chapter}
          onChange={(value) => {
            setChapter(value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        rowHref={(row) => `/volunteers/opportunities/${row.id}`}
        emptyMessage="No opportunities found"
      />

      <OpportunityFormDialog opportunity={null} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
