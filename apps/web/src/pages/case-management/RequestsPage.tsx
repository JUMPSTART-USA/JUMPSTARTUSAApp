import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MEETING_REQUEST_STATUSES,
  MEETING_REQUEST_STATUS_LABELS,
  PORTAL_MESSAGE_STATUSES,
  PORTAL_MESSAGE_STATUS_LABELS,
  TRANSPORT_REQUEST_STATUSES,
  TRANSPORT_REQUEST_STATUS_LABELS,
} from '@jumpstart/shared';
import { backTo } from '@/components/BackLink';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListToolbar, ToolbarDateField } from '@/components/ui/toolbar';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
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
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortDir: 'desc' });
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [status, setStatus] = useState('');
  const [reviewTarget, setReviewTarget] = useState<PortalMessageRow | null>(null);
  const canUpdate = can('case_management.update');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    participantProfileId: participant?.id,
    status,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'portal-messages', params],
    queryFn: () => api.get<Paged<PortalMessageRow>>(`/portal-messages${params}`),
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
          <ParticipantPicker
            value={participant}
            onChange={(p) => {
              setParticipant(p);
              setListState((s) => ({ ...s, page: 1 }));
            }}
          />
        </div>
        <Select
          className="w-full sm:w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {PORTAL_MESSAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PORTAL_MESSAGE_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </ListToolbar>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={setReviewTarget}
        emptyMessage="No portal messages"
      />

      <MessageReviewDialog message={reviewTarget} onClose={() => setReviewTarget(null)} />
    </div>
  );
}

function MeetingsTab() {
  const { can } = useAuth();
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortDir: 'desc' });
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [status, setStatus] = useState('');
  const [decisionTarget, setDecisionTarget] = useState<MeetingRequestRow | null>(null);
  const canUpdate = can('case_management.update');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    participantProfileId: participant?.id,
    status,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'meeting-requests', params],
    queryFn: () => api.get<Paged<MeetingRequestRow>>(`/meeting-requests${params}`),
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
            value={participant}
            onChange={(p) => {
              setParticipant(p);
              setListState((s) => ({ ...s, page: 1 }));
            }}
          />
        </div>
        <Select
          className="w-full sm:w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {MEETING_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MEETING_REQUEST_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </ListToolbar>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={setDecisionTarget}
        emptyMessage="No meeting requests"
      />

      <MeetingDecisionDialog request={decisionTarget} onClose={() => setDecisionTarget(null)} />
    </div>
  );
}

function TransportTab() {
  const { can } = useAuth();
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortDir: 'desc' });
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [decisionTarget, setDecisionTarget] = useState<TransportRequestRow | null>(null);
  const canUpdate = can('case_management.update');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    participantProfileId: participant?.id,
    status,
    from,
    to,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'transport-requests', params],
    queryFn: () => api.get<Paged<TransportRequestRow>>(`/transport-requests${params}`),
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
            value={participant}
            onChange={(p) => {
              setParticipant(p);
              setListState((s) => ({ ...s, page: 1 }));
            }}
          />
        </div>
        <Select
          className="w-full sm:w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {TRANSPORT_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TRANSPORT_REQUEST_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <ToolbarDateField
          label="From"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        <ToolbarDateField
          label="To"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
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
export function RequestsPage() {
  const counts = usePortalRequestsPending();

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Participant requests"
        description="Messages, meeting requests, and ride requests submitted through participant portal links."
      />
      <Tabs defaultValue="messages">
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
