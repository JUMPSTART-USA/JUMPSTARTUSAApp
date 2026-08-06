import {
  GIFT_FREQUENCIES,
  GIFT_FREQUENCY_LABELS,
  PLEDGE_STATUSES,
  PLEDGE_STATUS_LABELS,
  pledgeSchema,
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
import type { NamedRef, Pledge } from '../types';

interface PledgeFormValues {
  donorId: string;
  pledgeDate: string;
  totalAmount: number | string;
  installmentAmount?: number | string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  campaignId?: string;
  fundId?: string;
  appealId?: string;
  status: string;
  writtenOffAmount?: number | string;
  notes?: string;
}

function buildDefaults(pledge?: Pledge): PledgeFormValues {
  return {
    donorId: pledge?.donorId ?? '',
    pledgeDate: pledge ? toDateInput(pledge.pledgeDate) : todayInput(),
    totalAmount: pledge?.totalAmount ?? '',
    installmentAmount: pledge?.installmentAmount ?? '',
    frequency: pledge?.frequency ?? '',
    startDate: toDateInput(pledge?.startDate),
    endDate: toDateInput(pledge?.endDate),
    campaignId: pledge?.campaignId ?? '',
    fundId: pledge?.fundId ?? '',
    appealId: pledge?.appealId ?? '',
    status: pledge?.status ?? 'active',
    writtenOffAmount: pledge?.writtenOffAmount ?? '',
    notes: pledge?.notes ?? '',
  };
}

/** Create + edit form for pledges (commitment schedules, §6.8). */
export function PledgeFormDialog({
  open,
  onOpenChange,
  pledge,
  donorRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when present, create mode otherwise. */
  pledge?: Pledge;
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
  } = useForm<PledgeFormValues>({
    resolver: formResolver<PledgeFormValues>(pledgeSchema),
    defaultValues: buildDefaults(pledge),
  });

  const campaignId = watch('campaignId');
  const status = watch('status');
  const appealOptions = useAppealOptions(campaignId || undefined);

  // Keep inactive current links selectable so edits don't silently clear them.
  const extraFund =
    pledge?.fund && !fundOptions.data?.items.some((f) => f.id === pledge.fund?.id)
      ? pledge.fund
      : null;
  const extraAppeal =
    pledge?.appeal && !appealOptions.data?.items.some((a) => a.id === pledge.appeal?.id)
      ? pledge.appeal
      : null;

  useEffect(() => {
    if (open) {
      reset(buildDefaults(pledge));
      const fixed = donorRef ?? pledge?.donor;
      if (fixed) {
        setDonor({ id: fixed.id, label: fixed.name });
        setValue('donorId', fixed.id);
      } else {
        setDonor(null);
      }
      setTopError(null);
    }
  }, [open, pledge, donorRef, reset, setValue]);

  const mutation = useMutation({
    mutationFn: (values: PledgeFormValues) =>
      pledge
        ? api.patch<Pledge>(`/pledges/${pledge.id}`, {
            ...values,
            // Clearable fields: blank means "clear" on edit, not "no change".
            installmentAmount: values.installmentAmount ?? null,
            frequency: values.frequency ?? null,
            campaignId: values.campaignId ?? null,
            fundId: values.fundId ?? null,
            appealId: values.appealId ?? null,
            startDate: values.startDate ?? null,
            endDate: values.endDate ?? null,
            notes: values.notes ?? null,
            // Leaving written_off must clear the write-off, or the stale amount
            // keeps shrinking the balance and fulfills the pledge early.
            writtenOffAmount:
              values.status === 'written_off' ? (values.writtenOffAmount ?? null) : null,
          })
        : api.post<Pledge>('/pledges', values),
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
          <DialogTitle>{pledge ? 'Edit pledge' : 'New pledge'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField label="Donor" required error={errors.donorId}>
            <DonorPicker
              value={donor}
              disabled={Boolean(donorRef ?? pledge)}
              onChange={(d) => {
                setDonor(d);
                setValue('donorId', d?.id ?? '', { shouldValidate: Boolean(d) });
              }}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Pledge date" required error={errors.pledgeDate}>
              <Input type="date" {...register('pledgeDate')} />
            </FormField>
            <FormField label="Total amount" required error={errors.totalAmount}>
              <Input type="number" step="0.01" min="0" {...register('totalAmount')} />
            </FormField>
            <FormField label="Installment amount" error={errors.installmentAmount}>
              <Input type="number" step="0.01" min="0" {...register('installmentAmount')} />
            </FormField>
            <FormField label="Frequency" error={errors.frequency}>
              <Select {...register('frequency')}>
                <option value="">No schedule</option>
                {GIFT_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {GIFT_FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Start date" error={errors.startDate}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" error={errors.endDate}>
              <Input type="date" {...register('endDate')} />
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
            {pledge ? (
              <FormField label="Status" error={errors.status}>
                <Select {...register('status')}>
                  {PLEDGE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PLEDGE_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
            {pledge && status === 'written_off' ? (
              <FormField label="Written-off amount" required error={errors.writtenOffAmount}>
                <Input type="number" step="0.01" min="0" {...register('writtenOffAmount')} />
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
              {mutation.isPending ? 'Saving…' : pledge ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
