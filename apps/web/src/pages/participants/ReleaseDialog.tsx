import { releaseSchema } from '@jumpstart/shared';
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
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { fullName } from '@/lib/utils';
import type { ParticipantDetail } from './types';

interface ReleaseFormValues {
  releaseDate: string;
  reason: string;
}

/**
 * Records release from custody (§6.1): inside status → Released with the
 * release date, the transition appended to status history, and any active
 * inside location closed as of that date.
 */
export function ReleaseDialog({
  participant,
  open,
  onOpenChange,
}: {
  participant: ParticipantDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<ReleaseFormValues>({
    resolver: formResolver<ReleaseFormValues>(releaseSchema),
    defaultValues: { releaseDate: todayInput(), reason: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ releaseDate: todayInput(), reason: '' });
      setTopError(null);
    }
  }, [open, form]);

  const releaseMutation = useMutation({
    mutationFn: (body: object) =>
      api.post<ParticipantDetail>(`/participants/${participant.id}/release`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['participants'] });
      onOpenChange(false);
    },
    onError: (err) => {
      const message = applyApiError(err, form.setError);
      if (message) setTopError(message);
    },
  });

  const submit = form.handleSubmit((raw) => {
    setTopError(null);
    releaseMutation.mutate(raw as unknown as object);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent unsavedChanges={form.formState.isDirty}>
        <DialogHeader>
          <DialogTitle>Record release — {fullName(participant.person)}</DialogTitle>
          <DialogDescription>
            Sets the inside status to Released with this date, appends the transition to the status
            history, and closes the active inside location.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <FormField label="Release date" required error={form.formState.errors.releaseDate}>
            <Input type="date" {...form.register('releaseDate')} />
          </FormField>
          <FormField
            label="Reason / notes"
            error={form.formState.errors.reason}
            hint="Recorded on the status history entry; defaults to “Released from custody”."
          >
            <Input {...form.register('reason')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={releaseMutation.isPending}>
              {releaseMutation.isPending ? 'Saving…' : 'Record release'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
