import { CHAPTER_STATES, ALUMNI_STATUSES, INSIDE_STATUSES, OUTSIDE_STATUSES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { FilterSelect, unresolvedOptionLabel } from '@/components/ui/filter-select';
import { Checkbox } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { formatDate, fullName, humanize } from '@/lib/utils';
import type { ParticipantListItem } from './types';
import { BackLink } from '@/components/BackLink';

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
    key: 'location',
    header: 'Location',
    render: (row) =>
      row.insideLocations[0] ? (
        row.insideLocations[0].institution.name
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
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

  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      insideStatus: P.choice(INSIDE_STATUSES, ''),
      outsideStatus: P.choice(OUTSIDE_STATUSES, ''),
      alumniStatus: P.choice(ALUMNI_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
      institutionId: P.id(),
      /**
       * Sent as `assignedCaseManagerId: <me>`, so the URL carries the INTENT
       * ("my caseload") rather than a user id. A colleague opening the link sees
       * THEIR caseload, which is what the checkbox means; pasting an id would
       * have silently shown them someone else's.
       */
      myCaseload: P.flag(false),
    },
    { sort: { by: 'lastName' } },
  );

  // Location filter options: institutions are only listable with the
  // institutions.read permission — the filter hides without it.
  const institutionOptions = useQuery({
    queryKey: ['participants', 'institution-options'],
    queryFn: () =>
      api.get<Paged<{ id: string; name: string; state: string }>>(
        `/institutions${qs({ pageSize: 200, sortBy: 'name' })}`,
      ),
    staleTime: 5 * 60 * 1000,
    enabled: can('institutions.read'),
  });

  // Any filter change resets to page 1 — otherwise the page can outrun the total.
  const params = {
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // `values`, not `draft`: the query waits for typing to settle.
    search: values.search || undefined,
    insideStatus: values.insideStatus || undefined,
    outsideStatus: values.outsideStatus || undefined,
    alumniStatus: values.alumniStatus || undefined,
    state: values.state || undefined,
    institutionId: values.institutionId || undefined,
    assignedCaseManagerId: values.myCaseload ? user?.id : undefined,
  };

  const query = useQuery({
    queryKey: ['participants', 'list', params],
    queryFn: () => api.get<Paged<ParticipantListItem>>(`/participants${qs(params)}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Participants"
        actions={
          can('participants.create') ? (
            <Button onClick={() => navigate('new')}>
              <Plus className="h-4 w-4" /> New participant
            </Button>
          ) : undefined
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="Search name, number, phone, email…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Inside status"
          value={values.insideStatus}
          onChange={(value) => set('insideStatus', value as (typeof INSIDE_STATUSES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">Inside: all</option>
          {INSIDE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Outside status"
          value={values.outsideStatus}
          onChange={(value) => set('outsideStatus', value as (typeof OUTSIDE_STATUSES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">Outside: all</option>
          {OUTSIDE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Alumni status"
          value={values.alumniStatus}
          onChange={(value) => set('alumniStatus', value as (typeof ALUMNI_STATUSES)[number] | '')}
          className="w-full sm:w-44"
        >
          <option value="">Alumni: all</option>
          {ALUMNI_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): the `state` param filters by chapter now —
            hidden for scoped users, whom the API force-filters anyway. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
        {can('institutions.read') ? (
          <FilterSelect
            aria-label="Location"
            value={values.institutionId}
            onChange={(value) => set('institutionId', value)}
            className="w-full sm:w-56"
          >
            <option value="">Location: all</option>
            {/* Capped at 200 and permission-gated, so an id from a link may be
                absent. Must be a DIRECT child; see filter-select.tsx. */}
            {unresolvedOptionLabel(values.institutionId, institutionOptions.data?.items, institutionOptions.isLoading) ? (
              <option value={values.institutionId}>
                {unresolvedOptionLabel(values.institutionId, institutionOptions.data?.items, institutionOptions.isLoading)}
              </option>
            ) : null}
            {(institutionOptions.data?.items ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.state})
              </option>
            ))}
          </FilterSelect>
        ) : null}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={values.myCaseload}
            onChange={(e) => set('myCaseload', e.target.checked)}
          />
          My caseload
        </label>
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
          // The link carries the participant's NAME, not the case number:
          // a screen-reader user hears the link text as the row's identity,
          // and "P-2026-00011" is not an identity.
          linkColumnKey="name"
          isFiltered={isFiltered}
          onClearFilters={clear}
          emptyMessage="No participants match these filters"
        />
      )}
    </div>
  );
}
