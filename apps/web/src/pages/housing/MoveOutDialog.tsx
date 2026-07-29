import {
  FINAL_ASSESSMENTS,
  HOUSING_EXIT_STATUSES,
  HOUSING_STATUSES,
  optionalDate,
  optionalTrimmed,
  type HousingStatus,
} from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver, toDateInput, todayInput } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { emptyToUndef } from '@/pages/outside-programs/shared';
import type { HousingEnrollment } from './types';

interface MoveOutFormValues {
  status: HousingStatus;
  moveOutDate?: string;
  reasonForLeaving?: string;
  completionAssessment?: string;
  assessmentNotes?: string;
  notes?: string;
}

/**
 * Client-side mirror of the §6.4 moved-out rules the API re-validates on the
 * merged record: exit status ⇒ move-out date + reason; completed ⇒ assessment;
 * move-out date never before the (fixed) move-in date.
 */
function buildSchema(moveInDate: string) {
  return z
    .object({
      status: z.enum(HOUSING_STATUSES),
      moveOutDate: optionalDate,
      reasonForLeaving: optionalTrimmed,
      completionAssessment: z.enum(FINAL_ASSESSMENTS).optional(),
      assessmentNotes: optionalTrimmed,
      notes: optionalTrimmed,
    })
    .superRefine((val, ctx) => {
      const movedOut = (HOUSING_EXIT_STATUSES as readonly string[]).includes(val.status);
      if (movedOut && !val.moveOutDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Move-out date is required when a resident moves out',
          path: ['moveOutDate'],
        });
      }
      if (movedOut && !val.reasonForLeaving) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Reason for leaving is required when a resident moves out',
          path: ['reasonForLeaving'],
        });
      }
      if (val.status === 'completed' && !val.completionAssessment) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'A completion assessment (Blue/Green/Yellow/Red) is required to mark completed — use "assessment pending" until it is in',
          path: ['completionAssessment'],
        });
      }
      if (val.moveOutDate && val.moveOutDate < new Date(moveInDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Move-out date cannot be before move-in date',
          path: ['moveOutDate'],
        });
      }
    });
}

export function MoveOutDialog({
  open,
  onOpenChange,
  enrollment,
  residentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Also used to correct closed enrollments — fields prefill from the record. */
  enrollment: HousingEnrollment | null;
  residentName: string;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const schema = useMemo(
    () => buildSchema(enrollment?.moveInDate ?? '1970-01-01'),
    [enrollment?.moveInDate],
  );

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<MoveOutFormValues>({ resolver: formResolver<MoveOutFormValues>(schema) });
  const status = watch('status');
  const movedOut = (HOUSING_EXIT_STATUSES as readonly string[]).includes(status ?? '');

  useEffect(() => {
    if (open && enrollment) {
      const isActive = enrollment.status === 'active';
      reset({
        // Physically out while the assessment is still due ⇒ assessment_pending.
        status: isActive ? 'assessment_pending' : enrollment.status,
        moveOutDate: isActive ? todayInput() : toDateInput(enrollment.moveOutDate),
        reasonForLeaving: enrollment.reasonForLeaving ?? '',
        completionAssessment: enrollment.completionAssessment ?? '',
        assessmentNotes: enrollment.assessmentNotes ?? '',
        notes: enrollment.notes ?? '',
      });
      setTopError(null);
    }
  }, [open, enrollment, reset]);

  const mutation = useMutation({
    mutationFn: (values: MoveOutFormValues) =>
      api.patch<HousingEnrollment>(`/housing-enrollments/${enrollment!.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['housing'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  if (!enrollment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {enrollment.status === 'active' ? 'Move out resident' : 'Update enrollment'}
          </DialogTitle>
          <DialogDescription>
            {residentName} — moved in {formatDate(enrollment.moveInDate)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
          <FormError message={topError} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Status" required error={errors.status}>
              <Select {...register('status')}>
                {HOUSING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Move-out date" required={movedOut} error={errors.moveOutDate}>
              <Input type="date" {...register('moveOutDate')} />
            </FormField>
            <FormField
              label="Reason for leaving"
              required={movedOut}
              error={errors.reasonForLeaving}
              className="sm:col-span-2"
            >
              <Input {...register('reasonForLeaving')} />
            </FormField>
            <FormField
              label="Completion assessment"
              required={status === 'completed'}
              error={errors.completionAssessment}
              hint='Required to mark completed — keep "Assessment pending" until it is in'
            >
              <Select {...register('completionAssessment', { setValueAs: emptyToUndef })}>
                <option value="">—</option>
                {FINAL_ASSESSMENTS.map((a) => (
                  <option key={a} value={a}>
                    {humanize(a)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Assessment notes" error={errors.assessmentNotes}>
              <Textarea rows={2} {...register('assessmentNotes')} />
            </FormField>
            <FormField label="Notes" error={errors.notes} className="sm:col-span-2">
              <Textarea rows={2} {...register('notes')} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
