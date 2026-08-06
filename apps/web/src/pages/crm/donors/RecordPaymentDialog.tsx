import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  schedulePaymentSchema,
} from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver, todayInput } from '@/lib/form';

interface PaymentFormValues {
  donationDate: string;
  amount: number | string;
  paymentMethod?: string;
  receiptSent: boolean;
  notes?: string;
}

/**
 * Records a payment against a pledge or recurring gift. The API creates the
 * linked Donation (inheriting the schedule's designations) and updates the
 * schedule — pledge fulfillment or the next-gift date.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  endpoint,
  title,
  description,
  defaultAmount,
  defaultPaymentMethod,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** POST target, e.g. /pledges/:id/payments or /recurring-gifts/:id/payments. */
  endpoint: string;
  title: string;
  description?: string;
  defaultAmount?: string | number | null;
  defaultPaymentMethod?: string | null;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: formResolver<PaymentFormValues>(schedulePaymentSchema),
  });

  useEffect(() => {
    if (open) {
      reset({
        donationDate: todayInput(),
        amount: defaultAmount ?? '',
        paymentMethod: defaultPaymentMethod ?? '',
        receiptSent: false,
        notes: '',
      });
      setTopError(null);
    }
  }, [open, defaultAmount, defaultPaymentMethod, reset]);

  const mutation = useMutation({
    mutationFn: (values: PaymentFormValues) => api.post(endpoint, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date" required error={errors.donationDate}>
              <Input type="date" {...register('donationDate')} />
            </FormField>
            <FormField label="Amount" required error={errors.amount}>
              <Input type="number" step="0.01" min="0" {...register('amount')} />
            </FormField>
          </div>
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
          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...register('receiptSent')} /> Receipt sent
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
              {mutation.isPending ? 'Saving…' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
