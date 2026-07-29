import { ENROLLMENT_STATUSES, FINAL_ASSESSMENTS, insideEnrollmentSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
import { applyApiError, formResolver, toDateInput } from '@/lib/form';
import { fullName, humanize } from '@/lib/utils';
import type { RosterEnrollment } from './types';

// PATCH body: identity fields are immutable (§4.1.6), and the select posts ''
// for "no assessment" which must not hit the enum. The cross-field §6.2 rules
// (left_early ⇒ date+reason, completed ⇒ assessment) are re-checked by the API
// against the merged record and surfaced from its error response.
const enrollmentEditSchema = insideEnrollmentSchema
  .innerType()
  .omit({ participantProfileId: true, insideClassId: true })
  .extend({
    finalAssessment: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.enum(FINAL_ASSESSMENTS).optional(),
    ),
  });

interface EnrollmentFormValues {
  status: string;
  enrollmentDate: string;
  completionDate: string;
  leftEarlyDate: string;
  leftEarlyReason: string;
  finalAssessment: string;
  assessmentNotes: string;
  notes: string;
}

function buildDefaults(enrollment: RosterEnrollment): EnrollmentFormValues {
  return {
    status: enrollment.completionStatus,
    enrollmentDate: toDateInput(enrollment.enrollmentDate),
    completionDate: toDateInput(enrollment.completionDate),
    leftEarlyDate: toDateInput(enrollment.leftEarlyDate),
    leftEarlyReason: enrollment.leftEarlyReason ?? '',
    finalAssessment: enrollment.finalAssessment ?? '',
    assessmentNotes: enrollment.assessmentNotes ?? '',
    notes: enrollment.notes ?? '',
  };
}

export function EnrollmentEditDialog({
  open,
  onOpenChange,
  enrollment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollment: RosterEnrollment;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EnrollmentFormValues>({
    resolver: formResolver<EnrollmentFormValues>(enrollmentEditSchema),
    defaultValues: buildDefaults(enrollment),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults(enrollment));
      setTopError(null);
    }
  }, [open, enrollment, reset]);

  const status = watch('status');

  const mutation = useMutation({
    mutationFn: (values: EnrollmentFormValues) =>
      api.patch(`/inside-classes/enrollments/${enrollment.id}`, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inside-classes'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit enrollment</DialogTitle>
          <DialogDescription>
            {fullName(enrollment.participantProfile.person)}
            {enrollment.participantProfile.participantNumber
              ? ` · ${enrollment.participantProfile.participantNumber}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Status" required error={errors.status}>
              <Select {...register('status')}>
                {ENROLLMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Enrollment date" required error={errors.enrollmentDate}>
              <Input type="date" {...register('enrollmentDate')} />
            </FormField>
            <FormField
              label="Completion date"
              error={errors.completionDate}
              hint={status === 'completed' ? 'Cannot be before the enrollment date' : undefined}
            >
              <Input type="date" {...register('completionDate')} />
            </FormField>
            <FormField
              label="Final assessment"
              required={status === 'completed'}
              error={errors.finalAssessment}
              hint={
                status === 'completed'
                  ? 'Required to mark completed — use "Assessment pending" status until it is in'
                  : undefined
              }
            >
              <Select {...register('finalAssessment')}>
                <option value="">None</option>
                {FINAL_ASSESSMENTS.map((a) => (
                  <option key={a} value={a}>
                    {humanize(a)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Left-early date"
              required={status === 'left_early'}
              error={errors.leftEarlyDate}
            >
              <Input type="date" {...register('leftEarlyDate')} />
            </FormField>
            <FormField
              label="Left-early reason"
              required={status === 'left_early'}
              error={errors.leftEarlyReason}
              hint={status === 'left_early' ? 'Date and reason are required for left early' : undefined}
            >
              <Input {...register('leftEarlyReason')} />
            </FormField>
          </div>
          <FormField label="Assessment notes" error={errors.assessmentNotes}>
            <Textarea rows={2} {...register('assessmentNotes')} />
          </FormField>
          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>

          <FormError message={topError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
