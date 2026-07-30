import { zodResolver } from '@hookform/resolvers/zod';
import { donationSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
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
import { EntityPicker, type PickerOption } from '@/components/ui/entity-picker';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api, qs, type Paged } from '@/lib/api';
import { applyApiError, todayInput } from '@/lib/form';
import { useCampaignOptions } from '../shared';
import type { Donor, EventRecord } from '../types';

interface DonationFormValues {
  donorId: string;
  donationDate: string;
  amount: number | string;
  paymentMethod?: string;
  fund?: string;
  isRecurring: boolean;
  receiptSent: boolean;
  campaignId?: string;
  eventId?: string;
  notes?: string;
}

function DonorPicker({
  value,
  onChange,
}: {
  value: PickerOption | null;
  onChange: (option: PickerOption | null) => void;
}) {
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      queryKey="crm-donor-picker"
      placeholder="Search donors…"
      search={async (term) => {
        const page = await api.get<Paged<Donor>>(`/donors${qs({ search: term, pageSize: 8 })}`);
        return page.items.map((donor) => ({ id: donor.id, label: donor.name }));
      }}
    />
  );
}

/** Manual entry path for historical import fixes — normal gifts arrive via sync (§6.8). */
export function DonationFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [donor, setDonor] = useState<PickerOption | null>(null);
  const campaignOptions = useCampaignOptions();
  const eventOptions = useQuery({
    queryKey: ['crm', 'events', 'options'],
    queryFn: () =>
      api.get<Paged<EventRecord>>(
        `/events${qs({ pageSize: 200, sortBy: 'eventDate', sortDir: 'desc' })}`,
      ),
    staleTime: 60_000,
    enabled: open,
  });

  const form = useForm<DonationFormValues>({
    resolver: zodResolver(donationSchema) as unknown as Resolver<DonationFormValues>,
  });

  useEffect(() => {
    if (open) {
      form.reset({
        donorId: '',
        donationDate: todayInput(),
        amount: '',
        isRecurring: false,
        receiptSent: false,
      });
      setDonor(null);
      setFormError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (values: DonationFormValues) => api.post('/donations', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm'] });
      onOpenChange(false);
    },
    onError: (err) => setFormError(applyApiError(err, form.setError)),
  });

  const optional = { setValueAs: (v: unknown) => (v === '' ? undefined : v) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record donation</DialogTitle>
          <DialogDescription>
            Manual entry for historical fixes — regular gifts arrive from Bloomerang automatically.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <FormField label="Donor" required error={form.formState.errors.donorId}>
            <DonorPicker
              value={donor}
              onChange={(d) => {
                setDonor(d);
                form.setValue('donorId', d?.id ?? '', { shouldValidate: Boolean(d) });
              }}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Date" required error={form.formState.errors.donationDate}>
              <Input type="date" {...form.register('donationDate')} />
            </FormField>
            <FormField label="Amount" required error={form.formState.errors.amount}>
              <Input type="number" step="0.01" min="0" {...form.register('amount')} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Payment method" error={form.formState.errors.paymentMethod}>
              <Input {...form.register('paymentMethod', optional)} />
            </FormField>
            <FormField label="Fund" error={form.formState.errors.fund}>
              <Input {...form.register('fund', optional)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Campaign" error={form.formState.errors.campaignId}>
              <Select {...form.register('campaignId', optional)}>
                <option value="">None</option>
                {campaignOptions.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Event" error={form.formState.errors.eventId}>
              <Select {...form.register('eventId', optional)}>
                <option value="">None</option>
                {eventOptions.data?.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox {...form.register('isRecurring')} /> Recurring gift
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox {...form.register('receiptSent')} /> Receipt sent
            </label>
          </div>
          <FormField label="Notes" error={form.formState.errors.notes}>
            <Textarea rows={3} {...form.register('notes', optional)} />
          </FormField>
          <FormError message={formError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
