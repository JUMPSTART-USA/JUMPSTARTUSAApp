import {
  donorInteractionSchema,
  INTERACTION_CHANNELS,
  INTERACTION_CHANNEL_LABELS,
  INTERACTION_PURPOSES,
  INTERACTION_PURPOSE_LABELS,
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
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver, toDateInput, todayInput } from '@/lib/form';
import type { DonorInteraction } from '../types';

interface InteractionFormValues {
  donorId: string;
  date: string;
  channel: string;
  purpose: string;
  subject: string;
  isInbound: boolean;
  notes?: string;
}

/** Log or edit a donor touch — calls, mailings, thank-yous (§6.8). */
export function InteractionFormDialog({
  open,
  onOpenChange,
  donorId,
  interaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  donorId: string;
  /** Edit mode when present, create mode otherwise. */
  interaction?: DonorInteraction;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<InteractionFormValues>({
    resolver: formResolver<InteractionFormValues>(donorInteractionSchema),
  });

  useEffect(() => {
    if (open) {
      reset({
        donorId,
        date: interaction ? toDateInput(interaction.date) : todayInput(),
        channel: interaction?.channel ?? 'phone',
        purpose: interaction?.purpose ?? 'cultivation',
        subject: interaction?.subject ?? '',
        isInbound: interaction?.isInbound ?? false,
        notes: interaction?.notes ?? '',
      });
      setTopError(null);
    }
  }, [open, donorId, interaction, reset]);

  const mutation = useMutation({
    mutationFn: (values: InteractionFormValues) =>
      interaction
        ? // Clearable notes: blank means "clear" on edit, not "no change".
          api.patch(`/donor-interactions/${interaction.id}`, {
            ...values,
            notes: values.notes ?? null,
          })
        : api.post('/donor-interactions', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{interaction ? 'Edit interaction' : 'Log interaction'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Date" required error={errors.date}>
              <Input type="date" {...register('date')} />
            </FormField>
            <FormField label="Channel" required error={errors.channel}>
              <Select {...register('channel')}>
                {INTERACTION_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {INTERACTION_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Purpose" required error={errors.purpose}>
              <Select {...register('purpose')}>
                {INTERACTION_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {INTERACTION_PURPOSE_LABELS[p]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Subject" required error={errors.subject}>
            <Input {...register('subject')} placeholder="e.g. Thank-you call for spring gift" />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...register('isInbound')} /> Inbound (the donor reached out)
          </label>
          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : interaction ? 'Save' : 'Log interaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
