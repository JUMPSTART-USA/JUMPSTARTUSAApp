import {
  donationSchema,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  TRIBUTE_TYPE_LABELS,
  TRIBUTE_TYPES,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type PickerOption } from '@/components/ui/entity-picker';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, toDateInput, todayInput } from '@/lib/form';
import { DonorPicker, useAppealOptions, useCampaignOptions, useFundOptions } from '../shared';
import type { Donation, EventRecord, NamedRef } from '../types';

interface DonationFormValues {
  donorId: string;
  donationDate: string;
  amount: number | string;
  paymentMethod?: string;
  fundId?: string;
  campaignId?: string;
  appealId?: string;
  eventId?: string;
  tributeType?: string;
  tributeName?: string;
  tributeNotify?: string;
  isAnonymous: boolean;
  nonDeductibleAmount?: number | string;
  inKindDescription?: string;
  inKindFairMarketValue?: number | string;
  isRecurring: boolean;
  receiptSent: boolean;
  notes?: string;
}

function buildDefaults(donation?: Donation): DonationFormValues {
  return {
    donorId: donation?.donorId ?? '',
    donationDate: donation ? toDateInput(donation.donationDate) : todayInput(),
    amount: donation?.amount ?? '',
    paymentMethod: donation?.paymentMethod ?? '',
    fundId: donation?.fundId ?? '',
    campaignId: donation?.campaignId ?? '',
    appealId: donation?.appealId ?? '',
    eventId: donation?.eventId ?? '',
    tributeType: donation?.tributeType ?? '',
    tributeName: donation?.tributeName ?? '',
    tributeNotify: donation?.tributeNotify ?? '',
    isAnonymous: donation?.isAnonymous ?? false,
    nonDeductibleAmount: donation?.nonDeductibleAmount ?? '',
    inKindDescription: donation?.inKindDescription ?? '',
    inKindFairMarketValue: donation?.inKindFairMarketValue ?? '',
    isRecurring: donation?.isRecurring ?? false,
    receiptSent: donation?.receiptSent ?? false,
    notes: donation?.notes ?? '',
  };
}

/** Full gift entry — create + edit, tributes, in-kind, designations (§6.8). */
export function DonationFormDialog({
  open,
  onOpenChange,
  donation,
  donorRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when present, create mode otherwise. */
  donation?: Donation;
  /** Locks the donor picker when the gift is recorded from a donor context. */
  donorRef?: NamedRef;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [donor, setDonor] = useState<PickerOption | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const campaignOptions = useCampaignOptions();
  const fundOptions = useFundOptions();
  const eventOptions = useQuery({
    queryKey: ['crm', 'events', 'options'],
    queryFn: () =>
      api.get<Paged<EventRecord>>(
        `/events${qs({ pageSize: 200, sortBy: 'eventDate', sortDir: 'desc' })}`,
      ),
    staleTime: 60_000,
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DonationFormValues>({
    resolver: formResolver<DonationFormValues>(donationSchema),
    defaultValues: buildDefaults(donation),
  });

  const campaignId = watch('campaignId');
  const paymentMethod = watch('paymentMethod');
  const tributeType = watch('tributeType');
  const appealOptions = useAppealOptions(campaignId || undefined);

  useEffect(() => {
    if (open) {
      reset(buildDefaults(donation));
      const fixed = donorRef ?? donation?.donor;
      if (fixed) {
        setDonor({ id: fixed.id, label: fixed.name });
        setValue('donorId', fixed.id);
      } else {
        setDonor(null);
      }
      setTopError(null);
    }
  }, [open, donation, donorRef, reset, setValue]);

  const mutation = useMutation({
    mutationFn: (values: DonationFormValues) =>
      donation
        ? api.patch<Donation>(`/donations/${donation.id}`, {
            ...values,
            // Clearable fields: blank means "clear" on edit, not "no change".
            fundId: values.fundId ?? null,
            campaignId: values.campaignId ?? null,
            appealId: values.appealId ?? null,
            eventId: values.eventId ?? null,
            paymentMethod: values.paymentMethod ?? null,
            tributeType: values.tributeType ?? null,
            tributeName: values.tributeName ?? null,
            tributeNotify: values.tributeNotify ?? null,
            nonDeductibleAmount: values.nonDeductibleAmount ?? null,
            inKindDescription: values.inKindDescription ?? null,
            inKindFairMarketValue: values.inKindFairMarketValue ?? null,
            notes: values.notes ?? null,
          })
        : api.post<Donation>('/donations', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/donations/${donation?.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      setDeleteOpen(false);
      onOpenChange(false);
    },
  });

  // Historical imports may carry a method outside the standard vocabulary —
  // keep it selectable so editing doesn't silently rewrite it.
  const methodValue = donation?.paymentMethod;
  const extraMethod =
    methodValue && !(PAYMENT_METHOD_OPTIONS as readonly string[]).includes(methodValue)
      ? methodValue
      : null;
  // Likewise inactive funds/appeals: keep the current link selectable so an
  // edit doesn't silently clear it.
  const extraFund =
    donation?.fund && !fundOptions.data?.items.some((f) => f.id === donation.fund?.id)
      ? donation.fund
      : null;
  const extraAppeal =
    donation?.appeal && !appealOptions.data?.items.some((a) => a.id === donation.appeal?.id)
      ? donation.appeal
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{donation ? 'Edit donation' : 'Record donation'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField label="Donor" required error={errors.donorId}>
            <DonorPicker
              value={donor}
              disabled={Boolean(donorRef ?? donation)}
              onChange={(d) => {
                setDonor(d);
                setValue('donorId', d?.id ?? '', { shouldValidate: Boolean(d) });
              }}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date" required error={errors.donationDate}>
              <Input type="date" {...register('donationDate')} />
            </FormField>
            <FormField label="Amount" required error={errors.amount}>
              <Input type="number" step="0.01" min="0" {...register('amount')} />
            </FormField>
            <FormField label="Payment method" error={errors.paymentMethod}>
              <Select {...register('paymentMethod')}>
                <option value="">Select…</option>
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
                {extraMethod ? <option value={extraMethod}>{extraMethod}</option> : null}
              </Select>
            </FormField>
            <FormField label="Fund" error={errors.fundId}>
              <Select {...register('fundId')}>
                <option value="">None</option>
                {fundOptions.data?.items.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
                {extraFund ? <option value={extraFund.id}>{extraFund.name}</option> : null}
              </Select>
            </FormField>
            <FormField label="Campaign" error={errors.campaignId}>
              <Select
                {...register('campaignId', {
                  onChange: () => setValue('appealId', ''),
                })}
              >
                <option value="">None</option>
                {campaignOptions.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Appeal" error={errors.appealId}>
              <Select {...register('appealId')}>
                <option value="">None</option>
                {appealOptions.data?.items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                {extraAppeal ? <option value={extraAppeal.id}>{extraAppeal.name}</option> : null}
              </Select>
            </FormField>
            <FormField label="Event" error={errors.eventId} className="sm:col-span-2">
              <Select {...register('eventId')}>
                <option value="">None</option>
                {eventOptions.data?.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {paymentMethod === 'in_kind' ? (
            <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
              <FormField
                label="In-kind description"
                error={errors.inKindDescription}
                className="sm:col-span-2"
              >
                <Input {...register('inKindDescription')} placeholder="What was donated?" />
              </FormField>
              <FormField label="Fair market value" error={errors.inKindFairMarketValue}>
                <Input type="number" step="0.01" min="0" {...register('inKindFairMarketValue')} />
              </FormField>
            </div>
          ) : null}

          <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
            <FormField label="Tribute" error={errors.tributeType}>
              <Select
                {...register('tributeType', {
                  // Clearing the type hides name/notify — wipe them too, or the
                  // stale hidden values deadlock the tribute validation.
                  onChange: (e: ChangeEvent<HTMLSelectElement>) => {
                    if (!e.target.value) {
                      setValue('tributeName', '');
                      setValue('tributeNotify', '');
                    }
                  },
                })}
              >
                <option value="">Not a tribute gift</option>
                {TRIBUTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRIBUTE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </FormField>
            {tributeType ? (
              <>
                <FormField label="Tribute name" required error={errors.tributeName}>
                  <Input {...register('tributeName')} placeholder="Who this gift honors" />
                </FormField>
                <FormField
                  label="Notify"
                  error={errors.tributeNotify}
                  hint="Who to notify and how (name, address or email)."
                  className="sm:col-span-2"
                >
                  <Input {...register('tributeNotify')} />
                </FormField>
              </>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Non-deductible amount"
              error={errors.nonDeductibleAmount}
              hint="Portion with goods/services received (event meals, auction items)."
            >
              <Input type="number" step="0.01" min="0" {...register('nonDeductibleAmount')} />
            </FormField>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox {...register('isRecurring')} /> Recurring gift
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox {...register('receiptSent')} /> Receipt sent
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox {...register('isAnonymous')} /> Anonymous
              </label>
            </div>
          </div>

          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>

          <FormError message={topError} />

          <DialogFooter>
            {donation && can('donors.delete') ? (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : donation ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete donation?"
          description="The gift is removed from lists and giving totals. Linked pledge balances are recalculated."
          isPending={deleteMutation.isPending}
          error={deleteMutation.isError ? applyApiError(deleteMutation.error) : null}
          onConfirm={() => deleteMutation.mutate()}
        />
      </DialogContent>
    </Dialog>
  );
}
