import { GIFT_FREQUENCY_LABELS } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import { FormError } from '@/components/ui/notice';
import { PageHeader, SectionHeader } from '@/components/ui/page-header';
import { ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form';
import { formatDate, formatMoney, humanize } from '@/lib/utils';
import { StatTile } from '../shared';
import type { RecurringGiftDetail } from '../types';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { RecurringGiftFormDialog } from './RecurringGiftFormDialog';
import { BackLink } from '@/components/BackLink';

export function RecurringGiftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['crm', 'recurring-gifts', 'detail', id],
    queryFn: () => api.get<RecurringGiftDetail>(`/recurring-gifts/${id}`),
    enabled: Boolean(id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'active' | 'paused' | 'closed') =>
      api.patch(`/recurring-gifts/${id}`, { status }),
    onSuccess: () => {
      setStatusError(null);
      setCloseOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['crm', 'recurring-gifts'] });
    },
    onError: (err) => setStatusError(applyApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/recurring-gifts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'recurring-gifts'] });
      navigate('/donors/recurring');
    },
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  const gift = query.data;
  const canUpdate = can('donors.update');

  return (
    <div className="space-y-4">
      <BackLink fallbackTo="/donors/recurring" fallbackLabel="Recurring gifts" />

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {gift.donor ? (
              <Link to={`/donors/${gift.donor.id}`} className="hover:underline">
                {gift.donor.name}
              </Link>
            ) : (
              'Recurring gift'
            )}
            <StatusBadge status={gift.status} />
            {gift.isOverdue ? <Badge variant="warning">Overdue</Badge> : null}
          </span>
        }
        description={`${formatMoney(gift.amount)} ${GIFT_FREQUENCY_LABELS[gift.frequency].toLowerCase()} since ${formatDate(gift.startDate)}`}
        actions={
          <>
            {can('donors.create') && gift.status === 'active' ? (
              <Button onClick={() => setPaymentOpen(true)}>
                <CircleDollarSign className="h-4 w-4" /> Record payment
              </Button>
            ) : null}
            {canUpdate && gift.status === 'active' ? (
              <Button
                variant="outline"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate('paused')}
              >
                <Pause className="h-4 w-4" /> Pause
              </Button>
            ) : null}
            {canUpdate && gift.status === 'paused' ? (
              <Button
                variant="outline"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate('active')}
              >
                <Play className="h-4 w-4" /> Resume
              </Button>
            ) : null}
            {canUpdate && gift.status !== 'closed' ? (
              <Button variant="outline" onClick={() => setCloseOpen(true)}>
                Close
              </Button>
            ) : null}
            {canUpdate ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            ) : null}
            {can('donors.delete') ? (
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : null}
          </>
        }
      />

      <FormError message={statusError} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatTile label="Amount">{formatMoney(gift.amount)}</StatTile>
              <StatTile label="Next gift">{formatDate(gift.nextGiftDate)}</StatTile>
              <StatTile label="Last payment">{formatDate(gift.lastPaymentDate)}</StatTile>
              <StatTile label="Payments">{gift.paymentCount}</StatTile>
              <StatTile label="Total given">{formatMoney(gift.totalGiven)}</StatTile>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList className="gap-y-3">
              <InfoItem label="Frequency">{GIFT_FREQUENCY_LABELS[gift.frequency]}</InfoItem>
              <InfoItem label="Start / end">
                {[formatDate(gift.startDate), formatDate(gift.endDate)].join(' – ')}
              </InfoItem>
              <InfoItem label="Payment method">
                {gift.paymentMethod ? humanize(gift.paymentMethod) : '—'}
              </InfoItem>
              <InfoItem label="Campaign">
                {gift.campaign ? (
                  <Link to={`/campaigns/${gift.campaign.id}`} className="text-primary hover:underline">
                    {gift.campaign.name}
                  </Link>
                ) : (
                  '—'
                )}
              </InfoItem>
              <InfoItem label="Fund">{gift.fund?.name ?? '—'}</InfoItem>
              <InfoItem label="Appeal">{gift.appeal?.name ?? '—'}</InfoItem>
              <InfoItem label="Notes">
                <span className="whitespace-pre-wrap">{gift.notes ?? '—'}</span>
              </InfoItem>
            </DescriptionList>
          </CardContent>
        </Card>
      </div>

      <SectionHeader
        title={
          <>
            Payments{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({gift.payments.length})
            </span>
          </>
        }
      />

      {gift.payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gift.payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{formatDate(p.donationDate)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(p.amount)}</TableCell>
                <TableCell>{p.paymentMethod ? humanize(p.paymentMethod) : '—'}</TableCell>
                <TableCell>{p.receiptSent ? 'Sent' : '—'}</TableCell>
                <TableCell className="max-w-[240px] truncate">{p.notes ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <RecurringGiftFormDialog open={editOpen} onOpenChange={setEditOpen} gift={gift} />
      {id ? (
        <RecordPaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          endpoint={`/recurring-gifts/${id}/payments`}
          title="Record recurring payment"
          description="Creates a donation linked to this schedule and advances the next gift date."
          defaultAmount={gift.amount}
          defaultPaymentMethod={gift.paymentMethod}
        />
      ) : null}

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close recurring gift?"
        description="The schedule stops — payment history stays on the donor's record."
        confirmLabel="Close schedule"
        destructive={false}
        isPending={statusMutation.isPending}
        error={statusError}
        onConfirm={() => statusMutation.mutate('closed')}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete recurring gift?"
        description="Schedules with recorded payments cannot be deleted — close them instead."
        isPending={deleteMutation.isPending}
        error={deleteMutation.isError ? applyApiError(deleteMutation.error) : null}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
