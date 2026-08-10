import { useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { COMM_CHANNELS, COMM_STATUSES } from '@jumpstart/shared';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
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
import { useDebounced } from '@/lib/form';
import { formatDate, fullName, humanize } from '@/lib/utils';
import { PersonSearch, type PersonHit } from '@/pages/crm/shared';
import { SendDialog } from './SendDialog';
import { CHANNEL_LABELS, CommStatusBadge, messageSummary } from './shared';
import type { CommunicationRow } from './types';

/** All sent/queued messages, newest first — the cross-person outbox (§6.12). */
export function HistoryPage() {
  const { can } = useAuth();
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortDir: 'desc' });
  const [person, setPerson] = useState<PersonHit | null>(null);
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [chapter, setChapter] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<CommunicationRow | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    personId: person?.personId,
    channel,
    status,
    state: chapter,
    search: debouncedSearch,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['communications', 'history', params],
    queryFn: () => api.get<Paged<CommunicationRow>>(`/communications${params}`),
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
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
          placeholder="Search subject or body…"
        />
        <div className="w-full sm:w-72">
          <PersonSearch
            selected={person}
            onSelect={(hit) => {
              setPerson(hit);
              setListState((s) => ({ ...s, page: 1 }));
            }}
            placeholder="Filter by person…"
          />
        </div>
        <FilterSelect
          aria-label="Channel"
          className="w-full sm:w-44"
          value={channel}
          onChange={(value) => {
            setChannel(value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
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
          value={status}
          onChange={(value) => {
            setStatus(value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {COMM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
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
        onRowClick={setDetail}
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
