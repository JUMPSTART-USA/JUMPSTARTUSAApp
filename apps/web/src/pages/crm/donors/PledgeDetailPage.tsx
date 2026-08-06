import { GIFT_FREQUENCY_LABELS } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
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
import type { PledgeDetail } from '../types';
import { PledgeFormDialog } from './PledgeFormDialog';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { BackLink } from '@/components/BackLink';

function WriteOffDialog({
  open,
  onOpenChange,
  pledgeId,
  balance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pledgeId: string;
  balance: number;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [topError, setTopError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/pledges/${pledgeId}`, {
        status: 'written_off',
        writtenOffAmount: amount,
        ...(notes.trim() ? { notes } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setAmount(String(balance));
          setNotes('');
          setTopError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Write off pledge</DialogTitle>
          <DialogDescription>
            Marks the pledge written off — the unpaid balance is no longer expected.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Amount to write off" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <FormField label="Notes">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || amount === ''}
            >
              {mutation.isPending ? 'Saving…' : 'Write off'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PledgeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const query = useQuery({
    queryKey: ['crm', 'pledges', 'detail', id],
    queryFn: () => api.get<PledgeDetail>(`/pledges/${id}`),
    enabled: Boolean(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/pledges/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'pledges'] });
      navigate('/donors/pledges');
    },
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  const pledge = query.data;

  return (
    <div className="space-y-4">
      <BackLink fallbackTo="/donors/pledges" fallbackLabel="Pledges" />

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {pledge.donor ? (
              <Link to={`/donors/${pledge.donor.id}`} className="hover:underline">
                {pledge.donor.name}
              </Link>
            ) : (
              'Pledge'
            )}
            <StatusBadge status={pledge.status} />
            {pledge.inArrears && pledge.status === 'active' ? (
              <Badge variant="warning">In arrears</Badge>
            ) : null}
          </span>
        }
        description={`Pledged ${formatMoney(pledge.totalAmount)} on ${formatDate(pledge.pledgeDate)}`}
        actions={
          <>
            {can('donors.create') && pledge.status === 'active' ? (
              <Button onClick={() => setPaymentOpen(true)}>
                <CircleDollarSign className="h-4 w-4" /> Record payment
              </Button>
            ) : null}
            {can('donors.update') ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            ) : null}
            {can('donors.update') && pledge.status === 'active' ? (
              <Button variant="outline" onClick={() => setWriteOffOpen(true)}>
                Write off
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatTile label="Total">{formatMoney(pledge.totalAmount)}</StatTile>
              <StatTile label="Paid">{formatMoney(pledge.amountPaid)}</StatTile>
              <StatTile label="Balance">{formatMoney(pledge.balance)}</StatTile>
              <StatTile label="Percent paid">{Math.round(pledge.percentPaid)}%</StatTile>
              <StatTile label="Expected to date">
                {pledge.expectedToDate === null ? '—' : formatMoney(pledge.expectedToDate)}
              </StatTile>
              <StatTile label="Written off">
                {pledge.writtenOffAmount ? formatMoney(pledge.writtenOffAmount) : '—'}
              </StatTile>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList className="gap-y-3">
              <InfoItem label="Schedule">
                {pledge.frequency
                  ? `${formatMoney(pledge.installmentAmount)} ${GIFT_FREQUENCY_LABELS[pledge.frequency].toLowerCase()}`
                  : 'No schedule'}
              </InfoItem>
              <InfoItem label="Start / end">
                {[formatDate(pledge.startDate), formatDate(pledge.endDate)].join(' – ')}
              </InfoItem>
              <InfoItem label="Campaign">
                {pledge.campaign ? (
                  <Link to={`/campaigns/${pledge.campaign.id}`} className="text-primary hover:underline">
                    {pledge.campaign.name}
                  </Link>
                ) : (
                  '—'
                )}
              </InfoItem>
              <InfoItem label="Fund">{pledge.fund?.name ?? '—'}</InfoItem>
              <InfoItem label="Appeal">{pledge.appeal?.name ?? '—'}</InfoItem>
              <InfoItem label="Notes">
                <span className="whitespace-pre-wrap">{pledge.notes ?? '—'}</span>
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
              ({pledge.payments.length})
            </span>
          </>
        }
      />

      {pledge.payments.length === 0 ? (
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
            {pledge.payments.map((p) => (
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

      <PledgeFormDialog open={editOpen} onOpenChange={setEditOpen} pledge={pledge} />
      {id ? (
        <>
          <RecordPaymentDialog
            open={paymentOpen}
            onOpenChange={setPaymentOpen}
            endpoint={`/pledges/${id}/payments`}
            title="Record pledge payment"
            description="Creates a donation linked to this pledge; the balance updates automatically."
            defaultAmount={pledge.installmentAmount ?? pledge.balance}
          />
          <WriteOffDialog
            open={writeOffOpen}
            onOpenChange={setWriteOffOpen}
            pledgeId={id}
            balance={pledge.balance}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete pledge?"
        description="Pledges with recorded payments cannot be deleted — write them off or cancel instead."
        isPending={deleteMutation.isPending}
        error={deleteMutation.isError ? applyApiError(deleteMutation.error) : null}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
