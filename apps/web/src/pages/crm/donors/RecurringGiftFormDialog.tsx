import {
  GIFT_FREQUENCIES,
  GIFT_FREQUENCY_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  RECURRING_GIFT_STATUSES,
  RECURRING_GIFT_STATUS_LABELS,
  recurringGiftSchema,
} from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type PickerOption } from '@/components/ui/entity-picker';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver, toDateInput, todayInput } from '@/lib/form';
import { DonorPicker, useAppealOptions, useCampaignOptions, useFundOptions } from '../shared';
import type { NamedRef, RecurringGift } from '../types';

interface RecurringGiftFormValues {
  donorId: string;
  amount: number | string;
  frequency: string;
  startDate: string;
  endDate?: string;
  nextGiftDate?: string;
  paymentMethod?: string;
  campaignId?: string;
  fundId?: string;
  appealId?: string;
  status: string;
  notes?: string;
}

function buildDefaults(gift?: RecurringGift): RecurringGiftFormValues {
  return {
    donorId: gift?.donorId ?? '',
    amount: gift?.amount ?? '',
    frequency: gift?.frequency ?? 'monthly',
    startDate: gift ? toDateInput(gift.startDate) : todayInput(),
    endDate: toDateInput(gift?.endDate),
    nextGiftDate: toDateInput(gift?.nextGiftDate),
    paymentMethod: gift?.paymentMethod ?? '',
    campaignId: gift?.campaignId ?? '',
    fundId: gift?.fundId ?? '',
    appealId: gift?.appealId ?? '',
    status: gift?.status ?? 'active',
    notes: gift?.notes ?? '',
  };
}

/** Create + edit form for recurring gift schedules (§6.8). */
export function RecurringGiftFormDialog({
  open,
  onOpenChange,
  gift,
  donorRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when present, create mode otherwise. */
  gift?: RecurringGift;
  /** Locks the donor picker when opened from a donor context. */
  donorRef?: NamedRef;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [donor, setDonor] = useState<PickerOption | null>(null);

  const campaignOptions = useCampaignOptions();
  const fundOptions = useFundOptions();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RecurringGiftFormValues>({
    resolver: formResolver<RecurringGiftFormValues>(recurringGiftSchema),
    defaultValues: buildDefaults(gift),
  });

  const campaignId = watch('campaignId');
  const appealOptions = useAppealOptions(campaignId || undefined);

  // Keep inactive current links selectable so edits don't silently clear them.
  const extraFund =
    gift?.fund && !fundOptions.data?.items.some((f) => f.id === gift.fund?.id)
      ? gift.fund
      : null;
  const extraAppeal =
    gift?.appeal && !appealOptions.data?.items.some((a) => a.id === gift.appeal?.id)
      ? gift.appeal
      : null;

  useEffect(() => {
    if (open) {
      reset(buildDefaults(gift));
      const fixed = donorRef ?? gift?.donor;
      if (fixed) {
        setDonor({ id: fixed.id, label: fixed.name });
        setValue('donorId', fixed.id);
      } else {
        setDonor(null);
      }
      setTopError(null);
    }
  }, [open, gift, donorRef, reset, setValue]);

  const mutation = useMutation({
    mutationFn: (values: RecurringGiftFormValues) =>
      gift
        ? api.patch<RecurringGift>(`/recurring-gifts/${gift.id}`, {
            ...values,
            // Clearable fields: blank means "clear" on edit, not "no change".
            campaignId: values.campaignId ?? null,
            fundId: values.fundId ?? null,
            appealId: values.appealId ?? null,
            endDate: values.endDate ?? null,
            nextGiftDate: values.nextGiftDate ?? null,
            paymentMethod: values.paymentMethod ?? null,
            notes: values.notes ?? null,
          })
        : api.post<RecurringGift>('/recurring-gifts', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{gift ? 'Edit recurring gift' : 'New recurring gift'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField label="Donor" required error={errors.donorId}>
            <DonorPicker
              value={donor}
              disabled={Boolean(donorRef ?? gift)}
              onChange={(d) => {
                setDonor(d);
                setValue('donorId', d?.id ?? '', { shouldValidate: Boolean(d) });
              }}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount" required error={errors.amount}>
              <Input type="number" step="0.01" min="0" {...register('amount')} />
            </FormField>
            <FormField label="Frequency" required error={errors.frequency}>
              <Select {...register('frequency')}>
                {GIFT_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {GIFT_FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Start date" required error={errors.startDate}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" error={errors.endDate}>
              <Input type="date" {...register('endDate')} />
            </FormField>
            <FormField
              label="Next gift date"
              error={errors.nextGiftDate}
              hint="Defaults to the start date."
            >
              <Input type="date" {...register('nextGiftDate')} />
            </FormField>
            <FormField label="Payment method" error={errors.paymentMethod}>
              <Select {...register('paymentMethod')}>
                <option value="">Select…</option>
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
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
            {gift ? (
              <FormField label="Status" error={errors.status}>
                <Select {...register('status')}>
                  {RECURRING_GIFT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {RECURRING_GIFT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
          </div>

          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>

          <FormError message={topError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : gift ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
