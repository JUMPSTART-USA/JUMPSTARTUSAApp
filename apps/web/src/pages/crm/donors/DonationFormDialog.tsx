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
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { ErrorState, Spinner } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { applyApiErrors, useCampaignOptions, useDebouncedValue } from '../shared';
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
  selected,
  onSelect,
}: {
  selected: { id: string; name: string } | null;
  onSelect: (donor: { id: string; name: string } | null) => void;
}) {
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term);
  const enabled = !selected && debounced.trim().length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ['crm', 'donors', 'picker', debounced],
    enabled,
    queryFn: () => api.get<Paged<Donor>>(`/donors${qs({ search: debounced, pageSize: 8 })}`),
  });

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-1.5 text-sm">
        <span>{selected.name}</span>
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search donors…"
      />
      {enabled ? (
        <div className="max-h-40 overflow-y-auto rounded-md border">
          {isFetching ? (
            <div className="p-2">
              <Spinner className="mx-auto h-4 w-4" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No matches</p>
          ) : (
            data.items.map((donor) => (
              <button
                key={donor.id}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => onSelect({ id: donor.id, name: donor.name })}
              >
                {donor.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
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
  const [donor, setDonor] = useState<{ id: string; name: string } | null>(null);
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
        donationDate: '',
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
    onError: (err) => setFormError(applyApiErrors(err, form.setError)),
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
              selected={donor}
              onSelect={(d) => {
                setDonor(d);
                form.setValue('donorId', d?.id ?? '', { shouldValidate: Boolean(d) });
              }}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date" required error={form.formState.errors.donationDate}>
              <Input type="date" {...form.register('donationDate')} />
            </FormField>
            <FormField label="Amount" required error={form.formState.errors.amount}>
              <Input type="number" step="0.01" min="0" {...form.register('amount')} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Payment method" error={form.formState.errors.paymentMethod}>
              <Input {...form.register('paymentMethod', optional)} />
            </FormField>
            <FormField label="Fund" error={form.formState.errors.fund}>
              <Input {...form.register('fund', optional)} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
          {formError ? <ErrorState error={new Error(formError)} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Record donation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
