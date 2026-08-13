import {
  acknowledgeDonationSchema,
  INTERACTION_CHANNELS,
  INTERACTION_CHANNEL_LABELS,
} from '@jumpstart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { DataTable, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useListParams } from '@/lib/list-params';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver } from '@/lib/form';
import { formatDate, formatMoney } from '@/lib/utils';
import type { Donation } from '../types';
import { DonorsNav } from './DonorsNav';
import { BackLink } from '@/components/BackLink';

interface AcknowledgeFormValues {
  channel: string;
  sendReceipt: boolean;
  notes?: string;
}

function AcknowledgeDialog({
  donation,
  onOpenChange,
}: {
  donation: Donation | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AcknowledgeFormValues>({
    resolver: formResolver<AcknowledgeFormValues>(acknowledgeDonationSchema),
  });

  useEffect(() => {
    if (donation) {
      reset({ channel: 'mail', sendReceipt: false, notes: '' });
      setTopError(null);
    }
  }, [donation, reset]);

  const mutation = useMutation({
    mutationFn: (values: AcknowledgeFormValues) =>
      api.post(`/donations/${donation?.id}/acknowledge`, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={Boolean(donation)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acknowledge gift</DialogTitle>
          <DialogDescription>
            {donation
              ? `${formatMoney(donation.amount)} from ${donation.donor?.name ?? 'donor'} on ${formatDate(donation.donationDate)}. Logs a thank-you interaction on the donor record.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField label="Channel" error={errors.channel}>
            <Select {...register('channel')}>
              {INTERACTION_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {INTERACTION_CHANNEL_LABELS[c]}
                </option>
              ))}
            </Select>
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...register('sendReceipt')} /> Mark receipt sent
          </label>
          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Acknowledge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AcknowledgmentsPage() {
  const { can } = useAuth();
  const { listState: state, onListStateChange, clear, isFiltered } = useListParams(
    {},
    { sort: { by: 'donationDate', dir: 'asc' } },
  );
  const [acknowledging, setAcknowledging] = useState<Donation | null>(null);
  const canUpdate = can('donors.update');

  const params = qs({
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    acknowledged: 'false',
  });
  const query = useQuery({
    queryKey: ['crm', 'donations', 'ack-queue', params],
    queryFn: () => api.get<Paged<Donation>>(`/donations${params}`),
    // Rows stay put through a page change; DataTable dims them instead.
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<Column<Donation>[]>(() => {
    const cols: Column<Donation>[] = [
      {
        key: 'donationDate',
        header: 'Date',
        sortKey: 'donationDate',
        render: (d) => formatDate(d.donationDate),
      },
      {
        key: 'donor',
        header: 'Donor',
        render: (d) =>
          d.donor ? (
            <Link to={`/donors/${d.donor.id}`} className="font-medium text-primary hover:underline">
              {d.donor.name}
            </Link>
          ) : (
            '—'
          ),
      },
      {
        key: 'amount',
        header: 'Amount',
        sortKey: 'amount',
        className: 'text-right',
        render: (d) => <span className="tabular-nums">{formatMoney(d.amount)}</span>,
      },
      { key: 'fund', header: 'Fund', render: (d) => d.fund?.name ?? '—' },
      { key: 'campaign', header: 'Campaign', render: (d) => d.campaign?.name ?? '—' },
    ];
    if (canUpdate) {
      cols.push({
        key: 'actions',
        header: '',
        className: 'text-right',
        render: (d) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setAcknowledging(d);
            }}
          >
            <MailCheck className="h-3.5 w-3.5" /> Acknowledge
          </Button>
        ),
      });
    }
    return cols;
  }, [canUpdate]);

  /**
   * `state.page === 1` stays load-bearing, and with a total of 0 it means
   * exactly "the page is in range". This branch replaces the whole table with a
   * card — so on a shared or bookmarked ?page=3 whose result set has since
   * emptied, dropping the gate would unmount the very component that corrects
   * the page, leaving the URL pointing at a page that does not exist. Keep the
   * table mounted while out of range; DataTable snaps to page 1, the gate then
   * opens, and the card appears.
   */
  const isEmpty = !query.isLoading && (query.data?.total ?? 0) === 0 && state.page === 1;

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Acknowledgments"
        description="Gifts waiting on a thank-you — acknowledge each to log the outreach."
      />

      <DonorsNav />

      {query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}
      {isEmpty ? (
        <EmptyState
          title="All caught up"
          hint="Every donation on record has been acknowledged."
        />
      ) : (
        <DataTable
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          state={state}
          onStateChange={onListStateChange}
          isFiltered={isFiltered}
          onClearFilters={clear}
          emptyMessage="All caught up"
        />
      )}

      <AcknowledgeDialog
        donation={acknowledging}
        onOpenChange={(next) => {
          if (!next) setAcknowledging(null);
        }}
      />
    </div>
  );
}
