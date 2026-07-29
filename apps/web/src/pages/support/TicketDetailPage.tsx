import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { TICKET_CATEGORY_LABELS, TICKET_STATUSES } from '@jumpstart/shared';
import { BackLink } from '@/components/BackLink';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/input';
import { ErrorState, PageLoader } from '@/components/ui/spinner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, humanize } from '@/lib/utils';
import { format } from 'date-fns';
import type { SupportTicketDetail } from './types';

const fmtDateTime = (value: string) => format(new Date(value), 'MMM d, yyyy h:mm a');

/** One ticket: the full correspondence thread, reply box, and (for
 *  administrators) the status control. */
export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.roles.includes('admin') ?? false;
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['support', 'detail', id],
    queryFn: () => api.get<SupportTicketDetail>(`/support/tickets/${id}`),
    enabled: Boolean(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['support'] });
  };

  const send = useMutation({
    mutationFn: () => api.post(`/support/tickets/${id}/messages`, { body: reply }),
    onSuccess: () => {
      setReply('');
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not send reply'),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/support/tickets/${id}/status`, { status }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not update status'),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  const ticket = query.data;
  if (!ticket) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink fallbackTo="/support" fallbackLabel="Support" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">#{ticket.number}</span>
            <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {TICKET_CATEGORY_LABELS[ticket.category] ?? humanize(ticket.category)} · submitted by{' '}
            {ticket.createdBy.firstName} {ticket.createdBy.lastName} on{' '}
            {fmtDateTime(ticket.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={ticket.status} />
          {isAdmin ? (
            <Select
              className="w-36"
              value={ticket.status}
              disabled={setStatus.isPending}
              onChange={(e) => setStatus.mutate(e.target.value)}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {ticket.messages.map((m) => {
          const own = m.author.id === user?.id;
          const fromSubmitter = m.author.id === ticket.createdBy.id;
          return (
            <Card key={m.id} className={cn(!fromSubmitter && 'border-primary/40 bg-primary/5')}>
              <CardContent className="pt-4">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {m.author.firstName} {m.author.lastName}
                    {own ? ' (you)' : ''}
                  </span>
                  {!fromSubmitter ? <span className="font-medium">· Administrator</span> : null}
                  <span>· {fmtDateTime(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-2">
        <Textarea
          rows={4}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={isAdmin ? 'Reply to this ticket…' : 'Add more detail or reply…'}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end">
          <Button disabled={!reply.trim() || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      </div>
    </div>
  );
}
