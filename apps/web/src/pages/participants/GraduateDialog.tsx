import { graduationSchema } from '@jumpstart/shared';
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
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { api, ApiError } from '@/lib/api';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { fullName } from '@/lib/utils';
import type { ParticipantDetail } from './types';

interface GraduateFormValues {
  graduationDate: string;
  overrideIncompleteAssessments: boolean;
  overrideReason: string;
}

/**
 * §6.1 workflow 3: graduation requires completion assessments on open
 * enrollments — the API rejects otherwise, and that rejection is surfaced
 * with an explicit override + reason path (audit-logged server-side).
 */
export function GraduateDialog({
  participant,
  open,
  onOpenChange,
}: {
  participant: ParticipantDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<GraduateFormValues>({
    resolver: formResolver<GraduateFormValues>(graduationSchema),
    defaultValues: {
      graduationDate: todayInput(),
      overrideIncompleteAssessments: false,
      overrideReason: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        graduationDate: todayInput(),
        overrideIncompleteAssessments: false,
        overrideReason: '',
      });
      setBlockMessage(null);
      setTopError(null);
    }
  }, [open, form]);

  const graduateMutation = useMutation({
    mutationFn: (body: object) =>
      api.post<ParticipantDetail>(`/participants/${participant.id}/graduate`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['participants'] });
      onOpenChange(false);
    },
    onError: (err) => {
      // Incomplete-enrollment rejection: show it verbatim and open the
      // override path — never swallowed.
      if (err instanceof ApiError && err.message.startsWith('Cannot graduate')) {
        setBlockMessage(err.message);
        return;
      }
      const message = applyApiError(err, form.setError);
      if (message) setTopError(message);
    },
  });

  const submit = form.handleSubmit((raw) => {
    setTopError(null);
    graduateMutation.mutate(raw as unknown as object);
  });

  const overriding = form.watch('overrideIncompleteAssessments');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent unsavedChanges={form.formState.isDirty}>
        <DialogHeader>
          <DialogTitle>Graduate {fullName(participant.person)}</DialogTitle>
          <DialogDescription>
            Sets alumni status, marks the outside program completed, and schedules the 30-day, 6-,
            12-, 24- and 36-month outcome check-ins.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <FormField label="Graduation date" required error={form.formState.errors.graduationDate}>
            <Input type="date" {...form.register('graduationDate')} />
          </FormField>

          {blockMessage ? <Notice variant="warning">{blockMessage}</Notice> : null}

          {blockMessage || overriding ? (
            <div className="space-y-3 rounded-md border p-4">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" {...form.register('overrideIncompleteAssessments')} />
                <span>
                  Graduate anyway with incomplete assessments
                  <span className="block text-xs text-muted-foreground">
                    The override and reason are audit-logged.
                  </span>
                </span>
              </label>
              <FormField
                label="Override reason"
                required={overriding}
                error={form.formState.errors.overrideReason}
              >
                <Textarea rows={2} {...form.register('overrideReason')} />
              </FormField>
            </div>
          ) : null}

          <FormError message={topError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={graduateMutation.isPending}>
              {graduateMutation.isPending ? 'Saving…' : 'Graduate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
