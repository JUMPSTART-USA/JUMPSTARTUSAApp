import { optionalTrimmed, requiredDate } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver, toDateInput, todayInput } from '@/lib/form';
import type { OutsideSession } from './types';

// Sessions have no shared schema yet — composed from the shared primitives,
// mirroring the API controller's local schema exactly.
const sessionSchema = z.object({
  sessionDate: requiredDate,
  topic: optionalTrimmed,
  notes: optionalTrimmed,
});

interface SessionFormValues {
  sessionDate: string;
  topic?: string;
  notes?: string;
}

export function SessionFormDialog({
  open,
  onOpenChange,
  programId,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  /** When set the dialog edits; otherwise it creates. */
  session: OutsideSession | null;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SessionFormValues>({
    resolver: formResolver<SessionFormValues>(sessionSchema),
    defaultValues: { sessionDate: todayInput() },
  });

  useEffect(() => {
    if (open) {
      reset({
        sessionDate: session ? toDateInput(session.sessionDate) : todayInput(),
        topic: session?.topic ?? '',
        notes: session?.notes ?? '',
      });
      setTopError(null);
    }
  }, [open, session, reset]);

  const mutation = useMutation({
    mutationFn: (values: SessionFormValues) =>
      session
        ? api.patch<OutsideSession>(`/outside-programs/sessions/${session.id}`, values)
        : api.post<OutsideSession>(`/outside-programs/${programId}/sessions`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outside-programs'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{session ? 'Edit session' : 'Add session'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
          <FormError message={topError} />
          <FormField label="Session date" required error={errors.sessionDate}>
            <Input type="date" {...register('sessionDate')} autoFocus />
          </FormField>
          <FormField label="Topic" error={errors.topic}>
            <Input {...register('topic')} />
          </FormField>
          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : session ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
