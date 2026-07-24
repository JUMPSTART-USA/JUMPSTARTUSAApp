import {
  ENROLLMENT_STATUSES,
  FINAL_ASSESSMENTS,
  outsideEnrollmentSchema,
  type EnrollmentStatus,
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
import { Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { humanize } from '@/lib/utils';
import {
  applyApiError,
  dateInput,
  emptyToUndef,
  FormErrorNotice,
  formResolver,
  ParticipantPicker,
  participantLabel,
  todayInput,
  WarningNotice,
} from './shared';
import type { OutsideEnrollment, ParticipantRef } from './types';

interface EnrollmentFormValues {
  participantProfileId: string;
  outsideProgramId: string;
  enrollmentDate: string;
  status: EnrollmentStatus;
  completionDate?: string;
  leftEarlyDate?: string;
  leftEarlyReason?: string;
  completionAssessment?: string;
  assessmentNotes?: string;
  notes?: string;
}

const EXIT_HINT =
  'A completion assessment (Blue/Green/Yellow/Red) is required to mark completed — use “Assessment pending” until it is in.';

/** Shared conditional close-out fields (§6.2 rules, both dialogs). */
function CloseOutFields({
  status,
  register,
  errors,
}: {
  status: EnrollmentStatus;
  register: ReturnType<typeof useForm<EnrollmentFormValues>>['register'];
  errors: ReturnType<typeof useForm<EnrollmentFormValues>>['formState']['errors'];
}) {
  const showCompletion =
    status === 'completed' || status === 'assessment_pending' || status === 'transferred';
  const showLeftEarly = status === 'left_early';
  if (!showCompletion && !showLeftEarly) return null;
  return (
    <>
      {showCompletion ? (
        <>
          <FormField label="Completion date" error={errors.completionDate}>
            <Input type="date" {...register('completionDate')} />
          </FormField>
          <FormField
            label="Completion assessment"
            required={status === 'completed'}
            error={errors.completionAssessment}
            hint={EXIT_HINT}
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
          <FormField
            label="Assessment notes"
            error={errors.assessmentNotes}
            className="sm:col-span-2"
          >
            <Textarea rows={2} {...register('assessmentNotes')} />
          </FormField>
        </>
      ) : null}
      {showLeftEarly ? (
        <>
          <FormField label="Date left" required error={errors.leftEarlyDate}>
            <Input type="date" {...register('leftEarlyDate')} />
          </FormField>
          <FormField label="Reason for leaving" required error={errors.leftEarlyReason}>
            <Input {...register('leftEarlyReason')} />
          </FormField>
        </>
      ) : null}
    </>
  );
}

export function EnrollDialog({
  open,
  onOpenChange,
  programId,
  programName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  programName: string;
}) {
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<ParticipantRef | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EnrollmentFormValues>({
    resolver: formResolver<EnrollmentFormValues>(outsideEnrollmentSchema),
    defaultValues: {
      participantProfileId: '',
      outsideProgramId: programId,
      enrollmentDate: todayInput(),
      status: 'enrolled',
    },
  });
  const status = watch('status');

  useEffect(() => {
    if (open) {
      reset({
        participantProfileId: '',
        outsideProgramId: programId,
        enrollmentDate: todayInput(),
        status: 'enrolled',
      });
      setParticipant(null);
      setTopError(null);
      setWarnings(null);
    }
  }, [open, programId, reset]);

  const mutation = useMutation({
    mutationFn: (values: EnrollmentFormValues) =>
      api.post<OutsideEnrollment & { warnings: string[] }>(
        '/outside-programs/enrollments',
        values,
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['outside-programs'] });
      // Capacity warns, never blocks (§6.3) — show what the API flagged.
      if (res.warnings?.length) setWarnings(res.warnings);
      else onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Enroll participant</DialogTitle>
          <DialogDescription>{programName}</DialogDescription>
        </DialogHeader>
        {warnings ? (
          <div className="space-y-4">
            <p className="text-sm">Enrollment recorded.</p>
            <WarningNotice warnings={warnings} />
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <FormErrorNotice message={topError} />
            <input type="hidden" {...register('outsideProgramId')} />
            <input type="hidden" {...register('participantProfileId')} />
            <FormField
              label="Participant"
              required
              error={
                errors.participantProfileId ? { message: 'Select a participant' } : undefined
              }
            >
              <ParticipantPicker
                value={participant}
                onSelect={(p) => {
                  setParticipant(p);
                  setValue('participantProfileId', p?.id ?? '', { shouldValidate: !!p });
                }}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Enrollment date" required error={errors.enrollmentDate}>
                <Input type="date" {...register('enrollmentDate')} />
              </FormField>
              <FormField label="Status" error={errors.status}>
                <Select {...register('status')}>
                  {ENROLLMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <CloseOutFields status={status} register={register} errors={errors} />
              <FormField label="Notes" error={errors.notes} className="sm:col-span-2">
                <Textarea rows={2} {...register('notes')} />
              </FormField>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Enrolling…' : 'Enroll'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EnrollmentEditDialog({
  open,
  onOpenChange,
  enrollment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollment: OutsideEnrollment | null;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<EnrollmentFormValues>({
    resolver: formResolver<EnrollmentFormValues>(outsideEnrollmentSchema),
  });
  const status = watch('status');

  useEffect(() => {
    if (open && enrollment) {
      reset({
        participantProfileId: enrollment.participantProfileId,
        outsideProgramId: enrollment.outsideProgramId,
        enrollmentDate: dateInput(enrollment.enrollmentDate),
        status: enrollment.status,
        completionDate: dateInput(enrollment.completionDate),
        leftEarlyDate: dateInput(enrollment.leftEarlyDate),
        leftEarlyReason: enrollment.leftEarlyReason ?? '',
        completionAssessment: enrollment.completionAssessment ?? '',
        assessmentNotes: enrollment.assessmentNotes ?? '',
        notes: enrollment.notes ?? '',
      });
      setTopError(null);
    }
  }, [open, enrollment, reset]);

  const mutation = useMutation({
    mutationFn: (values: EnrollmentFormValues) => {
      // The API PATCH schema omits the two identity fields — re-pointing an
      // enrollment would rewrite history.
      const { participantProfileId: _p, outsideProgramId: _o, ...body } = values;
      return api.patch<OutsideEnrollment>(
        `/outside-programs/enrollments/${enrollment!.id}`,
        body,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outside-programs'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  if (!enrollment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit enrollment</DialogTitle>
          <DialogDescription>
            {participantLabel(enrollment.participantProfile)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
          <FormErrorNotice message={topError} />
          <input type="hidden" {...register('participantProfileId')} />
          <input type="hidden" {...register('outsideProgramId')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Enrollment date" required error={errors.enrollmentDate}>
              <Input type="date" {...register('enrollmentDate')} />
            </FormField>
            <FormField label="Status" error={errors.status}>
              <Select {...register('status')}>
                {ENROLLMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <CloseOutFields status={status} register={register} errors={errors} />
            <FormField label="Notes" error={errors.notes} className="sm:col-span-2">
              <Textarea rows={2} {...register('notes')} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
