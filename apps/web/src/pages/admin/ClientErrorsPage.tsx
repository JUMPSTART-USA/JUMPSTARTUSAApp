import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterSelect, unresolvedOptionLabel } from '@/components/ui/filter-select';
import { SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { formatDateTime, JsonBlock } from './shared';

const SOURCES = ['boundary', 'window', 'promise'] as const;

/** What each capture point means, in words a reader can act on. */
const SOURCE_META: Record<string, { label: string; variant: BadgeProps['variant']; hint: string }> =
  {
    boundary: {
      label: 'Render',
      variant: 'destructive',
      hint: 'Thrown while React was rendering — the user saw the error screen.',
    },
    window: {
      label: 'Script',
      variant: 'warning',
      hint: 'Thrown outside React: an event handler, a timer, or a script failure.',
    },
    promise: {
      label: 'Promise',
      variant: 'warning',
      hint: 'A rejected promise nobody handled — often a failed request.',
    },
  };

interface ClientErrorRow {
  id: string;
  message: string;
  stack: string | null;
  route: string;
  source: string;
  buildId: string;
  viewportW: number | null;
  viewportH: number | null;
  userAgent: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  user: { id: string; firstName: string; lastName: string } | null;
}

/**
 * Browser errors, grouped. The app had none of this until phase 5 — a dropdown
 * bug took four rounds and a hand-measured window size to pin down, because
 * nothing the browser did was ever visible from the server.
 *
 * Rows are grouped by message + route + build, so a screen that broke for twenty
 * people is one row with a count rather than twenty rows to scroll past.
 */
export function ClientErrorsPage() {
  const { can } = useAuth();
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      source: P.choice(SOURCES, ''),
      /**
       * NOT P.id(): a build id is a commit SHA in production and `dev-<ts>`
       * locally, neither of which is a uuid — P.id() would have validated every
       * real value away and left the filter looking broken. Plain text with the
       * debounce off, because it is chosen from a select, not typed.
       */
      buildId: P.text('', 0),
    },
    { sort: { by: 'lastSeenAt', dir: 'desc' } },
  );
  const [detail, setDetail] = useState<ClientErrorRow | null>(null);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // `values`, not `draft`: the query waits for typing to settle.
    search: values.search,
    source: values.source,
    buildId: values.buildId,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'client-errors', params],
    queryFn: () => api.get<Paged<ClientErrorRow>>(`/client-errors${params}`),
    enabled: can('audit.read'),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const builds = useQuery({
    queryKey: ['admin', 'client-errors', 'builds'],
    queryFn: () => api.get<string[]>('/client-errors/builds'),
    enabled: can('audit.read'),
    staleTime: 60_000,
  });

  if (!can('audit.read')) {
    return <EmptyState title="No access" hint="Requires the audit.read permission." />;
  }

  const columns: Column<ClientErrorRow>[] = [
    {
      key: 'lastSeenAt',
      header: 'Last seen',
      sortKey: 'lastSeenAt',
      className: 'whitespace-nowrap',
      render: (row) => formatDateTime(row.lastSeenAt),
    },
    {
      key: 'message',
      header: 'Error',
      render: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.message}</div>
          <div className="truncate text-xs text-muted-foreground">{row.route}</div>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Where',
      render: (row) => {
        const meta = SOURCE_META[row.source];
        return <Badge variant={meta?.variant ?? 'outline'}>{meta?.label ?? row.source}</Badge>;
      },
    },
    {
      key: 'count',
      header: 'Seen',
      sortKey: 'count',
      className: 'tabular-nums',
      render: (row) => row.count.toLocaleString('en-US'),
    },
    {
      key: 'viewport',
      header: 'Viewport',
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      // The detail the last hard bug turned on, which is why it has a column.
      render: (row) => (row.viewportW ? `${row.viewportW}×${row.viewportH}` : '—'),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Client errors"
        description="Errors reported by browsers, grouped by message, route and build."
      />

      <ListToolbar>
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          placeholder="Search message or route…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Source"
          className="w-full sm:w-44"
          value={values.source}
          onChange={(value) => set('source', value as (typeof SOURCES)[number] | '')}
        >
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_META[s]?.label ?? s}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Build"
          className="w-full sm:w-56"
          value={values.buildId}
          onChange={(value) => set('buildId', value)}
        >
          <option value="">All builds</option>
          {/* Only the 20 most recent builds are listed, so a link to an older
              one would otherwise read as "All builds" over a filtered list.
              Must be a DIRECT child; see filter-select.tsx. */}
          {unresolvedOptionLabel(
            values.buildId,
            builds.data?.map((id) => ({ id })),
            builds.isLoading,
          ) ? (
            <option value={values.buildId}>
              {unresolvedOptionLabel(
                values.buildId,
                builds.data?.map((id) => ({ id })),
                builds.isLoading,
              )}
            </option>
          ) : null}
          {(builds.data ?? []).map((id) => (
            <option key={id} value={id}>
              {id.slice(0, 12)}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowOpen={(row) => setDetail(row)}
        rowLabel={(row) => `View error: ${row.message}`}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No client errors reported"
      />

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="break-words">{detail?.message}</DialogTitle>
            <DialogDescription>
              {detail ? SOURCE_META[detail.source]?.hint : null}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <Detail label="Route" value={detail.route} />
                <Detail label="Seen" value={`${detail.count}×`} />
                <Detail
                  label="Viewport"
                  value={detail.viewportW ? `${detail.viewportW}×${detail.viewportH}` : '—'}
                />
                <Detail label="Build" value={detail.buildId} />
                <Detail label="First seen" value={formatDateTime(detail.firstSeenAt)} />
                <Detail label="Last seen" value={formatDateTime(detail.lastSeenAt)} />
                <Detail
                  label="First reporter"
                  value={
                    detail.user ? `${detail.user.firstName} ${detail.user.lastName}` : 'Signed out'
                  }
                />
              </dl>
              {detail.userAgent ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    User agent
                  </p>
                  <p className="break-words text-xs text-muted-foreground">{detail.userAgent}</p>
                </div>
              ) : null}
              {detail.stack ? <JsonBlock value={detail.stack} /> : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}
