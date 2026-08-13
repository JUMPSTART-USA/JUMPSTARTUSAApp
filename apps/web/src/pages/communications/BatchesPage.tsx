import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { CHAPTER_STATES } from '@jumpstart/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SectionHeader } from '@/components/ui/page-header';
import { Notice } from '@/components/ui/notice';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { applyApiError } from '@/lib/form';
import { formatDate } from '@/lib/utils';
import { NewBatchDialog } from './NewBatchDialog';
import { CHANNEL_LABELS, CommStatusBadge } from './shared';
import type { BatchRow } from './types';

/**
 * Batch sends (§6.12): create → review matched/queued/suppressed → dispatch
 * (email/SMS) or download the letter PDF. Dispatch is separate from creation
 * so a miscast audience can be caught before anything leaves the building.
 */
export function BatchesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { sort: { dir: 'desc' } },
  );
  const [newOpen, setNewOpen] = useState(false);
  const [dispatchTarget, setDispatchTarget] = useState<BatchRow | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const canCreate = can('communications.create');
  const canDispatch = can('communications.update');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // `values`, not `draft`: the query waits for typing to settle.
    search: values.search,
    state: values.state,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['communications', 'batches', params],
    queryFn: () => api.get<Paged<BatchRow>>(`/communications/batches${params}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  /**
   * The API already returns per-message outcomes; this used to throw them away
   * and close the dialog, so a 3,000-recipient send where every message failed
   * looked identical to a clean one. Report the counts the way NewBatchDialog
   * already reports its match/queue/suppress numbers.
   */
  const dispatch = useMutation({
    mutationFn: (batch: BatchRow) =>
      api.post<{ counts: { processed: number; sent: number; failed: number } }>(
        `/communications/batches/${batch.id}/dispatch`,
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      setDispatchTarget(null);
      setDispatchError(null);
      const { processed, sent, failed } = result.counts;
      setDispatchResult(
        failed === 0
          ? `Sent ${sent} of ${processed}.`
          : sent === 0
            ? `All ${failed} messages failed to send. Nothing was delivered.`
            : `Sent ${sent} of ${processed} — ${failed} failed.`,
      );
    },
    onError: (err) => setDispatchError(applyApiError(err)),
  });

  const columns: Column<BatchRow>[] = [
    {
      key: 'name',
      header: 'Name',
      sortKey: 'name',
      render: (b) => <span className="font-medium">{b.name}</span>,
    },
    {
      key: 'channel',
      header: 'Channel',
      sortKey: 'channel',
      render: (b) => CHANNEL_LABELS[b.channel],
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (b) => <CommStatusBadge status={b.status} />,
    },
    {
      key: 'recipients',
      header: 'Recipients',
      render: (b) => b._count.communications,
      className: 'tabular-nums text-right',
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortKey: 'createdAt',
      render: (b) => formatDate(b.createdAt),
      className: 'whitespace-nowrap',
    },
    {
      key: 'sentAt',
      header: 'Sent',
      sortKey: 'sentAt',
      render: (b) => formatDate(b.sentAt),
      className: 'whitespace-nowrap',
    },
    {
      key: 'actions',
      header: '',
      className: 'w-40 text-right',
      render: (b) => (
        <div className="flex justify-end gap-2">
          {b.channel === 'letter' && b._count.communications > 0 ? (
            <a
              href={`/api/communications/batches/${b.id}/letters.pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <FileText className="h-3.5 w-3.5" /> Letters PDF
            </a>
          ) : null}
          {canDispatch &&
          b.status === 'queued' &&
          (b.channel === 'email' || b.channel === 'sms') ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setDispatchError(null);
                setDispatchTarget(b);
              }}
            >
              <Send className="h-3.5 w-3.5" /> Dispatch
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Batches"
        description="Bulk sends built from a template and an audience filter."
        actions={
          canCreate ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New batch
            </Button>
          ) : null
        }
      />

      {dispatchResult ? (
        <Notice variant={dispatchResult.includes('failed') ? 'warning' : 'success'}>
          {dispatchResult}
        </Notice>
      ) : null}

      <ListToolbar>
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search batches…"
        />
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
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No batches yet"
      />

      <NewBatchDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <ConfirmDialog
        open={dispatchTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDispatchTarget(null);
            setDispatchError(null);
          }
        }}
        title="Dispatch batch?"
        description={
          dispatchTarget
            ? `Send ${dispatchTarget._count.communications} queued ${
                dispatchTarget._count.communications === 1 ? 'message' : 'messages'
              } via ${CHANNEL_LABELS[dispatchTarget.channel]} for “${dispatchTarget.name}”. This cannot be undone.`
            : undefined
        }
        confirmLabel="Send"
        destructive={false}
        isPending={dispatch.isPending}
        error={dispatchError}
        onConfirm={() => dispatchTarget && dispatch.mutate(dispatchTarget)}
      />
    </div>
  );
}
