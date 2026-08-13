import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { CHAPTER_STATES, COMM_CHANNELS, COMM_STATUSES } from '@jumpstart/shared';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterSelect } from '@/components/ui/filter-select';
import { SectionHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { formatDate, fullName, humanize } from '@/lib/utils';
import { PersonSearch, usePersonOption } from '@/pages/crm/shared';
import { SendDialog } from './SendDialog';
import { CHANNEL_LABELS, CommStatusBadge, messageSummary } from './shared';
import type { CommunicationRow } from './types';

/** All sent/queued messages, newest first — the cross-person outbox (§6.12). */
export function HistoryPage() {
  const { can } = useAuth();
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      personId: P.id(),
      channel: P.choice(COMM_CHANNELS, ''),
      status: P.choice(COMM_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { sort: { dir: 'desc' } },
  );
  /** The URL carries the person id; this turns it back into the name. */
  const person = usePersonOption(values.personId);
  const [detail, setDetail] = useState<CommunicationRow | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // The URL value, not the resolved option: the list filters on what the link
    // asked for while the name is still loading.
    personId: values.personId,
    channel: values.channel,
    status: values.status,
    state: values.state,
    // `values`, not `draft`: the query waits for typing to settle.
    search: values.search,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['communications', 'history', params],
    queryFn: () => api.get<Paged<CommunicationRow>>(`/communications${params}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const columns: Column<CommunicationRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortKey: 'createdAt',
      render: (c) => formatDate(c.sentAt ?? c.createdAt),
      className: 'whitespace-nowrap',
    },
    {
      key: 'person',
      header: 'Person',
      render: (c) => <span className="font-medium">{fullName(c.person)}</span>,
    },
    {
      key: 'channel',
      header: 'Channel',
      sortKey: 'channel',
      render: (c) => CHANNEL_LABELS[c.channel],
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (c) => (
        <div className="max-w-xs truncate">{messageSummary(c.subject, c.body)}</div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (c) => <CommStatusBadge status={c.status} />,
    },
    {
      key: 'detail',
      header: 'Detail',
      render: (c) =>
        c.statusDetail ? (
          <div className="max-w-xs truncate text-muted-foreground">{c.statusDetail}</div>
        ) : (
          '—'
        ),
    },
    {
      // The row click was the only opener for the message detail, so the sent
      // message itself was unreadable without a mouse. The label names the
      // recipient so the buttons are distinguishable from one another.
      key: 'actions',
      header: '',
      className: 'w-20 text-right',
      render: (c) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`View message to ${fullName(c.person)}`}
          onClick={(e) => {
            e.stopPropagation();
            setDetail(c);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="History"
        description="Every email, text and letter sent through the platform."
        actions={
          can('communications.create') ? (
            <Button onClick={() => setSendOpen(true)}>
              <Send className="h-4 w-4" /> Send message
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search subject or body…"
        />
        <div className="w-full sm:w-72">
          <PersonSearch
            selected={person.value}
            status={person.status}
            onRetry={person.onRetry}
            onSelect={(hit) => set('personId', hit?.personId ?? '')}
            placeholder="Filter by person…"
          />
        </div>
        <FilterSelect
          aria-label="Channel"
          className="w-full sm:w-44"
          value={values.channel}
          onChange={(value) => set('channel', value as (typeof COMM_CHANNELS)[number] | '')}
        >
          <option value="">All channels</option>
          {COMM_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof COMM_STATUSES)[number] | '')}
        >
          <option value="">All statuses</option>
          {COMM_STATUSES.map((s) => (
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

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      <DataTable chapterScoped
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowClick={setDetail}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No messages yet"
      />

      <MessageDetailDialog message={detail} onClose={() => setDetail(null)} />
      <SendDialog open={sendOpen} onClose={() => setSendOpen(false)} />
    </div>
  );
}

function MessageDetailDialog({
  message,
  onClose,
}: {
  message: CommunicationRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        {message ? (
          <>
            <DialogHeader>
              <DialogTitle>{messageSummary(message.subject, message.body)}</DialogTitle>
              <DialogDescription>
                {CHANNEL_LABELS[message.channel]} to {fullName(message.person)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <DescriptionList>
                <InfoItem label="Status">
                  <CommStatusBadge status={message.status} />
                </InfoItem>
                <InfoItem label="Sent">
                  {message.sentAt ? formatDate(message.sentAt) : 'Not sent yet'}
                </InfoItem>
                <InfoItem label="Created">{formatDate(message.createdAt)}</InfoItem>
                <InfoItem label="Template">{message.template?.name}</InfoItem>
                <InfoItem label="Batch">{message.batch?.name}</InfoItem>
                <InfoItem label="Status detail">{message.statusDetail}</InfoItem>
              </DescriptionList>
              {message.subject ? (
                <p className="text-sm font-medium">{message.subject}</p>
              ) : null}
              <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
                {message.body}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
