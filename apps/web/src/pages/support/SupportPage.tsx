import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUSES,
  type TicketCategory,
} from '@jumpstart/shared';
import { BackLink } from '@/components/BackLink';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import type { SupportTicketRow } from './types';

/**
 * Support (§6.15): every signed-in user files bug reports and feature
 * suggestions here and follows their own tickets; administrators get an
 * extra tab with the full queue.
 */
export function SupportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.roles.includes('admin') ?? false;
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const [statusFilter, setStatusFilter] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const mineQuery = useQuery({
    queryKey: ['support', 'mine'],
    queryFn: () => api.get<SupportTicketRow[]>('/support/tickets'),
  });
  const allQuery = useQuery({
    queryKey: ['support', 'all', statusFilter],
    queryFn: () => api.get<SupportTicketRow[]>(`/support/tickets/all${qs({ status: statusFilter })}`),
    enabled: isAdmin && tab === 'all',
  });

  const query = tab === 'all' ? allQuery : mineQuery;
  const tickets = query.data ?? [];

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground">
            Report bugs and suggest features — an administrator will respond on your ticket.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> New ticket
        </Button>
      </div>

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'mine' | 'all')}>
            <TabsList>
              <TabsTrigger value="mine">My tickets</TabsTrigger>
              <TabsTrigger value="all">All tickets</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === 'all' ? (
            <Select
              className="w-40"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      ) : null}

      {query.isLoading ? <PageLoader /> : null}
      {query.isError ? <ErrorState error={query.error} /> : null}
      {!query.isLoading && !query.isError && tickets.length === 0 ? (
        <EmptyState
          title={tab === 'all' ? 'No tickets' : 'No tickets yet'}
          hint={tab === 'all' ? undefined : 'File one with the New ticket button.'}
        />
      ) : null}

      {tickets.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Category</TableHead>
              {tab === 'all' ? <TableHead>Submitted by</TableHead> : null}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow
                key={t.id}
                className="cursor-pointer transition-colors hover:bg-muted/60"
                onClick={() => navigate(`/support/${t.id}`)}
              >
                <TableCell className="font-mono text-xs">#{t.number}</TableCell>
                <TableCell className="font-medium">{t.subject}</TableCell>
                <TableCell>{TICKET_CATEGORY_LABELS[t.category] ?? humanize(t.category)}</TableCell>
                {tab === 'all' ? (
                  <TableCell>
                    {t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : '—'}
                  </TableCell>
                ) : null}
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{t._count?.messages ?? 0}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDate(t.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <NewTicketDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function NewTicketDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [category, setCategory] = useState<TicketCategory>('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setCategory('bug');
      setSubject('');
      setBody('');
      setError(null);
    }
    onOpenChange(next);
  };

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/support/tickets', { category, subject, body }),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['support'] });
      close(false);
      navigate(`/support/${ticket.id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not submit ticket'),
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New support ticket</DialogTitle>
          <DialogDescription>
            Describe the bug or the feature you would like — an administrator will reply here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Category" required>
            <Select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
              {Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Subject" required>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary"
              maxLength={200}
            />
          </FormField>
          <FormField label="Description" required>
            <Textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What happened, or what would you like to see? Steps to reproduce help a lot."
            />
          </FormField>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              disabled={!subject.trim() || !body.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Submitting…' : 'Submit ticket'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
