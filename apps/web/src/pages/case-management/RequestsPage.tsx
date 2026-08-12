import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CHAPTER_STATES,
  MEETING_REQUEST_STATUSES,
  MEETING_REQUEST_STATUS_LABELS,
  PORTAL_MESSAGE_STATUSES,
  PORTAL_MESSAGE_STATUS_LABELS,
  TRANSPORT_REQUEST_STATUSES,
  TRANSPORT_REQUEST_STATUS_LABELS,
} from '@jumpstart/shared';
import { backTo } from '@/components/BackLink';
import { P, useListParams } from '@/lib/list-params';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { SectionHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListToolbar, ToolbarDateField } from '@/components/ui/toolbar';
import { ParticipantPicker, useParticipantOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePortalRequestsPending } from '@/lib/portal-requests';
import { formatDate, fullName } from '@/lib/utils';
import {
  MeetingDecisionDialog,
  MessageReviewDialog,
  TransportDecisionDialog,
  formatClockTime,
  type MeetingRequestRow,
  type PortalMessageRow,
  type TransportRequestRow,
} from './portal-request-dialogs';

// Route the main session wires this page under; participant links carry it as
// back-state so the profile's BackLink returns here.
const REQUESTS_PATH = '/case-management/requests';
const BACK_LABEL = 'Participant requests';

function ParticipantCell({
  participantProfileId,
  person,
}: {
  participantProfileId: string;
  person: { firstName: string; lastName: string };
}) {
  const { can } = useAuth();
  return can('participants.read') ? (
    <Link
      to={`/participants/${participantProfileId}`}
      {...backTo(REQUESTS_PATH, BACK_LABEL)}
      className="font-medium text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {fullName(person)}
    </Link>
  ) : (
    <>{fullName(person)}</>
  );
}

/** Small pending-count pill on a tab label; hidden at zero. */
function TabCount({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <Badge variant="warning" className="ml-1.5 px-1.5 py-0 text-[11px]">
      {count}
    </Badge>
  );
}

function MessagesTab() {
  const { can } = useAuth();
  /**
   * ns 'msg': all three queues mount on this one route and their query bodies
   * are otherwise identical, so an un-namespaced ?page= would page whichever
   * queue the user opened next — the one place in this migration where a
   * missing namespace is a silent data bug rather than a cosmetic one.
   */
  const { values, set, listState, onListStateChange } = useListParams(
    {
      participantId: P.id(),
      status: P.choice(PORTAL_MESSAGE_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { ns: 'msg', sort: { dir: 'desc' } },
  );
  /** The URL carries the id; this turns it back into the name on the chip. */
  const participant = useParticipantOption(values.participantId);
  const [reviewTarget, setReviewTarget] = useState<PortalMessageRow | null>(null);
  const canUpdate = can('case_management.update');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // The URL value, not the resolved option: the list must filter on what the
    // link asked for even while the name is still loading, or a restored link
    // would flash the whole queue before narrowing.
    participantProfileId: values.participantId,
    status: values.status,
    state: values.state,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['case-management', 'portal-messages', params],
    queryFn: () => api.get<Paged<PortalMessageRow>>(`/portal-messages${params}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const columns: Column<PortalMessageRow>[] = [
    {
      key: 'createdAt',
      header: 'Date',
      sortKey: 'createdAt',
      render: (m) => formatDate(m.createdAt),
      className: 'whitespace-nowrap',
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (m) => (
        <ParticipantCell
          participantProfileId={m.participantProfileId}
          person={m.participant.person}
        />
      ),
    },
    {
      key: 'message',
      header: 'Message',
      render: (m) => (
        <div className="max-w-xs">
          {m.subject ? <div className="truncate font-medium">{m.subject}</div> : null}
          <div className="truncate text-muted-foreground">{m.body}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => <StatusBadge status={m.status} />,
    },
    ...(canUpdate
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-10',
            render: (m: PortalMessageRow) =>
              m.status !== 'responded' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReviewTarget(m);
                  }}
                >
                  Review
                </Button>
              ) : null,
          } satisfies Column<PortalMessageRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <ListToolbar>
        <div className="w-full sm:w-72">
          {/* `set` deletes the page key in the same write, so the explicit
              page-1 reset the useState version needed is gone. */}
          <ParticipantPicker
            {...participant}
            onChange={(p) => set('participantId', p?.id ?? '')}
          />
        </div>
        <FilterSelect
          aria-label="Message status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof PORTAL_MESSAGE_STATUSES)[number] | '')}
        >
          <option value="">All statuses</option>
          {PORTAL_MESSAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PORTAL_MESSAGE_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): portal queues derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowClick={setReviewTarget}
        emptyMessage="No portal messages"
      />

      <MessageReviewDialog message={reviewTarget} onClose={() => setReviewTarget(null)} />
    </div>
  );
}

function MeetingsTab() {
  const { can } = useAuth();
  /**
   * ns 'mtg': all three queues mount on this one route and their query bodies
   * are otherwise identical, so an un-namespaced ?page= would page whichever
   * queue the user opened next — the one place in this migration where a
   * missing namespace is a silent data bug rather than a cosmetic one.
   */
  const { values, set, listState, onListStateChange } = useListParams(
    {
      participantId: P.id(),
      status: P.choice(MEETING_REQUEST_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { ns: 'mtg', sort: { dir: 'desc' } },
  );
  /** The URL carries the id; this turns it back into the name on the chip. */
  const participant = useParticipantOption(values.participantId);
  const [decisionTarget, setDecisionTarget] = useState<MeetingRequestRow | null>(null);
  const canUpdate = can('case_management.update');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // The URL value, not the resolved option — see MessagesTab.
    participantProfileId: values.participantId,
    status: values.status,
    state: values.state,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['case-management', 'meeting-requests', params],
    queryFn: () => api.get<Paged<MeetingRequestRow>>(`/meeting-requests${params}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const columns: Column<MeetingRequestRow>[] = [
    {
      key: 'preferredDate',
      header: 'Requested for',
      sortKey: 'preferredDate',
      render: (r) => (
        <span className="whitespace-nowrap">
          {formatDate(r.preferredDate)}
          {r.preferredTime ? (
            <span className="text-muted-foreground"> · {formatClockTime(r.preferredTime)}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (r) => (
        <ParticipantCell
          participantProfileId={r.participantProfileId}
          person={r.participant.person}
        />
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) => <div className="max-w-xs truncate text-muted-foreground">{r.reason}</div>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'decidedAt',
      header: 'Decided',
      render: (r) => (r.decidedAt ? formatDate(r.decidedAt) : '—'),
      className: 'whitespace-nowrap',
    },
    ...(canUpdate
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-10',
            render: (r: MeetingRequestRow) =>
              r.status === 'pending' || r.status === 'scheduled' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDecisionTarget(r);
                  }}
                >
                  {r.status === 'pending' ? 'Review' : 'Cancel'}
                </Button>
              ) : null,
          } satisfies Column<MeetingRequestRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <ListToolbar>
        <div className="w-full sm:w-72">
          <ParticipantPicker
            {...participant}
            onChange={(p) => set('participantId', p?.id ?? '')}
          />
        </div>
        <FilterSelect
          aria-label="Meeting status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof MEETING_REQUEST_STATUSES)[number] | '')}
        >
          <option value="">All statuses</option>
          {MEETING_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MEETING_REQUEST_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): portal queues derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowClick={setDecisionTarget}
        emptyMessage="No meeting requests"
      />

      <MeetingDecisionDialog request={decisionTarget} onClose={() => setDecisionTarget(null)} />
    </div>
  );
}

function TransportTab() {
  const { can } = useAuth();
  /**
   * ns 'trn': all three queues mount on this one route and their query bodies
   * are otherwise identical, so an un-namespaced ?page= would page whichever
   * queue the user opened next — the one place in this migration where a
   * missing namespace is a silent data bug rather than a cosmetic one.
   */
  const { values, set, listState, onListStateChange } = useListParams(
    {
      participantId: P.id(),
      status: P.choice(TRANSPORT_REQUEST_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
      from: P.date(),
      to: P.date(),
    },
    { ns: 'trn', sort: { dir: 'desc' } },
  );
  /** The URL carries the id; this turns it back into the name on the chip. */
  const participant = useParticipantOption(values.participantId);
  const [decisionTarget, setDecisionTarget] = useState<TransportRequestRow | null>(null);
  const canUpdate = can('case_management.update');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // The URL value, not the resolved option — see MessagesTab.
    participantProfileId: values.participantId,
    status: values.status,
    state: values.state,
    from: values.from,
    to: values.to,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['case-management', 'transport-requests', params],
    queryFn: () => api.get<Paged<TransportRequestRow>>(`/transport-requests${params}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const columns: Column<TransportRequestRow>[] = [
    {
      key: 'tripDate',
      header: 'Trip',
      sortKey: 'tripDate',
      render: (r) => (
        <span className="whitespace-nowrap">
          {formatDate(r.tripDate)}
          <span className="text-muted-foreground"> · {formatClockTime(r.tripTime)}</span>
        </span>
      ),
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (r) => (
        <ParticipantCell
          participantProfileId={r.participantProfileId}
          person={r.participant.person}
        />
      ),
    },
    {
      key: 'destination',
      header: 'Destination',
      render: (r) => <div className="max-w-xs truncate">{r.destination}</div>,
    },
    {
      key: 'return',
      header: 'Return?',
      render: (r) =>
        r.returnTripRequested && r.returnDate ? (
          <span
            className="cursor-help underline decoration-dotted underline-offset-2"
            title={`${formatDate(r.returnDate)}${
              r.returnTime ? ` at ${formatClockTime(r.returnTime)}` : ''
            }${r.returnDestination ? ` → ${r.returnDestination}` : ''}`}
          >
            Yes
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'decidedAt',
      header: 'Decided',
      render: (r) => (r.decidedAt ? formatDate(r.decidedAt) : '—'),
      className: 'whitespace-nowrap',
    },
    ...(canUpdate
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-10',
            render: (r: TransportRequestRow) =>
              r.status === 'pending' || r.status === 'approved' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDecisionTarget(r);
                  }}
                >
                  {r.status === 'pending' ? 'Review' : 'Manage'}
                </Button>
              ) : null,
          } satisfies Column<TransportRequestRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <ListToolbar className="items-end">
        <div className="w-full sm:w-72">
          <ParticipantPicker
            {...participant}
            onChange={(p) => set('participantId', p?.id ?? '')}
          />
        </div>
        <FilterSelect
          aria-label="Transportation status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof TRANSPORT_REQUEST_STATUSES)[number] | '')}
        >
          <option value="">All statuses</option>
          {TRANSPORT_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TRANSPORT_REQUEST_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): portal queues derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
        <ToolbarDateField
          label="From"
          value={values.from}
          onChange={(e) => set('from', e.target.value)}
        />
        <ToolbarDateField
          label="To"
          value={values.to}
          onChange={(e) => set('to', e.target.value)}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowClick={setDecisionTarget}
        emptyMessage="No transportation requests"
      />

      <TransportDecisionDialog request={decisionTarget} onClose={() => setDecisionTarget(null)} />
    </div>
  );
}

/**
 * Staff review queues for everything participants submit through their portal
 * links: messages, meeting requests, and transportation requests. The
 * case-management layout owns the h1; tabs badge their live pending counts.
 */
/** The queue tabs; anything else in ?tab= falls back to messages. */
const REQUEST_TABS = ['messages', 'meetings', 'transport'] as const;
type RequestTab = (typeof REQUEST_TABS)[number];

export function RequestsPage() {
  /** 'messages' is the default, so it is the value ABSENT from the URL. */
  const { values: tabValues, set: setTab } = useListParams({
    tab: P.choice(REQUEST_TABS, 'messages'),
  });
  const tab = tabValues.tab || 'messages';
  const counts = usePortalRequestsPending();

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Participant requests"
        description="Messages, meeting requests, and ride requests submitted through participant portal links."
      />
      {/**
        * Controlled from ?tab=, and it has to move in the same change as the three
        * queues inside it: each now keeps its page and filters in the URL under its
        * own namespace, so a restored ?trn.page=2 on a tab strip that silently reset
        * to Messages would hold page 2 of a queue the user cannot see. Radix
        * unmounts inactive tabs, so it would not even be rendered.
        */}
      <Tabs value={tab} onValueChange={(next) => setTab('tab', next as RequestTab)}>
        <TabsList>
          <TabsTrigger value="messages">
            Messages
            <TabCount count={counts.data?.messages} />
          </TabsTrigger>
          <TabsTrigger value="meetings">
            Meetings
            <TabCount count={counts.data?.meetings} />
          </TabsTrigger>
          <TabsTrigger value="transport">
            Transportation
            <TabCount count={counts.data?.transport} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="messages">
          <MessagesTab />
        </TabsContent>
        <TabsContent value="meetings">
          <MeetingsTab />
        </TabsContent>
        <TabsContent value="transport">
          <TransportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
