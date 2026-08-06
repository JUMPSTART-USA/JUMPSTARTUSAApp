import { zodResolver } from '@hookform/resolvers/zod';
import { eventSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/form';
import { useCampaignOptions } from '../shared';
import type { EventRecord } from '../types';

interface EventFormValues {
  name: string;
  eventType?: string;
  eventDate: string;
  location?: string;
  campaignId?: string;
  description?: string;
  attendanceCount?: number | string;
  revenue?: number | string;
  expenses?: number | string;
  notes?: string;
}

export function EventFormDialog({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: EventRecord | null;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const campaignOptions = useCampaignOptions();

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema) as unknown as Resolver<EventFormValues>,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        event
          ? {
              name: event.name,
              eventType: event.eventType ?? '',
              eventDate: event.eventDate.slice(0, 10),
              location: event.location ?? '',
              campaignId: event.campaignId ?? '',
              description: event.description ?? '',
              attendanceCount: event.attendanceCount ?? '',
              revenue: event.revenue ?? '',
              expenses: event.expenses ?? '',
              notes: event.notes ?? '',
            }
          : { name: '', eventDate: '' },
      );
      setFormError(null);
    }
  }, [open, event]);

  const mutation = useMutation({
    mutationFn: (values: EventFormValues) =>
      event
        ? api.patch<EventRecord>(`/events/${event.id}`, {
            ...values,
            // Clearable fields: blank means "clear" on edit, not "no change".
            eventType: values.eventType ?? null,
            location: values.location ?? null,
            campaignId: values.campaignId ?? null,
            description: values.description ?? null,
            attendanceCount: values.attendanceCount ?? null,
            revenue: values.revenue ?? null,
            expenses: values.expenses ?? null,
            notes: values.notes ?? null,
          })
        : api.post<EventRecord>('/events', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'events'] });
      onOpenChange(false);
    },
    onError: (err) => setFormError(applyApiError(err, form.setError)),
  });

  const optional = { setValueAs: (v: unknown) => (v === '' ? undefined : v) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? 'Edit event' : 'New event'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <FormField label="Name" required error={form.formState.errors.name}>
            <Input {...form.register('name')} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Date" required error={form.formState.errors.eventDate}>
              <Input type="date" {...form.register('eventDate')} />
            </FormField>
            <FormField label="Type" hint="e.g. Banquet, Golf outing" error={form.formState.errors.eventType}>
              <Input {...form.register('eventType', optional)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Location" error={form.formState.errors.location}>
              <Input {...form.register('location', optional)} />
            </FormField>
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
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Attendance" error={form.formState.errors.attendanceCount}>
              <Input type="number" min="0" step="1" {...form.register('attendanceCount', optional)} />
            </FormField>
            <FormField label="Revenue" error={form.formState.errors.revenue}>
              <Input type="number" min="0" step="0.01" {...form.register('revenue', optional)} />
            </FormField>
            <FormField label="Expenses" error={form.formState.errors.expenses}>
              <Input type="number" min="0" step="0.01" {...form.register('expenses', optional)} />
            </FormField>
          </div>
          <FormField label="Description" error={form.formState.errors.description}>
            <Textarea rows={3} {...form.register('description', optional)} />
          </FormField>
          <FormField label="Notes" error={form.formState.errors.notes}>
            <Textarea rows={2} {...form.register('notes', optional)} />
          </FormField>
          <FormError message={formError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : event ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
