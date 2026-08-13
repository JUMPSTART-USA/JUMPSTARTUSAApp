import { CHAPTER_STATES, DONOR_TYPES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { formatDate, formatMoney, humanize } from '@/lib/utils';
import { LifecycleBadge } from '../shared';
import type { DonorListItem } from '../types';
import { DonorFormDialog } from './DonorFormDialog';
import { DonorsNav } from './DonorsNav';

const DONOR_STATUSES = ['active', 'lapsed', 'inactive'] as const;

const columns: Column<DonorListItem>[] = [
  { key: 'name', header: 'Name', sortKey: 'name', render: (d) => <span className="font-medium">{d.name}</span> },
  { key: 'donorType', header: 'Type', sortKey: 'donorType', render: (d) => humanize(d.donorType) },
  { key: 'status', header: 'Status', sortKey: 'status', render: (d) => <StatusBadge status={d.status} /> },
  { key: 'lifecycle', header: 'Lifecycle', render: (d) => <LifecycleBadge lifecycle={d.lifecycle} /> },
  { key: 'household', header: 'Household', render: (d) => d.household?.name ?? '—' },
  {
    key: 'chapterState',
    header: 'Chapter',
    sortKey: 'chapterState',
    render: (d) => <Badge variant="outline">{d.chapterState}</Badge>,
  },
  { key: 'email', header: 'Email', render: (d) => d.email ?? '—' },
  {
    key: 'location',
    header: 'City / State',
    sortKey: 'city',
    render: (d) => [d.city, d.state].filter(Boolean).join(', ') || '—',
  },
  {
    key: 'lifetimeGiving',
    header: 'Lifetime giving',
    className: 'text-right',
    render: (d) => <span className="tabular-nums">{formatMoney(d.lifetimeGiving)}</span>,
  },
  { key: 'lastGiftDate', header: 'Last gift', render: (d) => formatDate(d.lastGiftDate) },
];

export function DonorsListPage() {
  const { can } = useAuth();
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      donorType: P.choice(DONOR_TYPES, ''),
      status: P.choice(DONOR_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
  );
  const [createOpen, setCreateOpen] = useState(false);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: values.search,
    donorType: values.donorType,
    status: values.status,
    state: values.state,
  });
  const query = useQuery({
    queryKey: ['crm', 'donors', 'list', params],
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
    queryFn: () => api.get<Paged<DonorListItem>>(`/donors${params}`),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Donors"
        description="Donor records, households and giving history."
        actions={
          can('donors.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New donor
            </Button>
          ) : null
        }
      />

      <DonorsNav />

      <ListToolbar>
        <SearchInput
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search name or email…"
        />
        <FilterSelect
          aria-label="Donor type"
          value={values.donorType}
          onChange={(value) => set('donorType', value as (typeof DONOR_TYPES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">All types</option>
          {DONOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Status"
          value={values.status}
          onChange={(value) => set('status', value as (typeof DONOR_STATUSES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">All statuses</option>
          {DONOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
      </ListToolbar>

      {query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}
      <DataTable chapterScoped
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        state={listState}
        onStateChange={onListStateChange}
        rowHref={(row) => `/donors/${row.id}`}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No donors found"
      />

      <DonorFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
