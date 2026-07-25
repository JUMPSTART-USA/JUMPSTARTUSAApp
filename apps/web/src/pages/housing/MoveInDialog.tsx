import {
  FINAL_ASSESSMENTS,
  HOUSING_EXIT_STATUSES,
  HOUSING_STATUSES,
  housingEnrollmentSchema,
  type HousingStatus,
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
  emptyToUndef,
  FormErrorNotice,
  formResolver,
  ParticipantPicker,
  todayInput,
  WarningNotice,
} from '@/pages/outside-programs/shared';
import type { ParticipantRef } from '@/pages/outside-programs/types';
import type { HousingEnrollment, TransitionalHome } from './types';
import { homeOptionLabel, useHomeOptions } from './useHomeOptions';

interface MoveInFormValues {
  participantProfileId: string;
  homeId: string;
  moveInDate: string;
  moveOutDate?: string;
  status: HousingStatus;
  reasonForLeaving?: string;
  completionAssessment?: string;
  assessmentNotes?: string;
  notes?: string;
}

export function MoveInDialog({
  open,
  onOpenChange,
  home,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the destination home is fixed; otherwise a select is offered. */
  home: TransitionalHome | null;
}) {
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<ParticipantRef | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);

  const homeOptions = useHomeOptions(open && !home);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MoveInFormValues>({
    resolver: formResolver<MoveInFormValues>(housingEnrollmentSchema),
    defaultValues: {
      participantProfileId: '',
      homeId: home?.id ?? '',
      moveInDate: todayInput(),
      status: 'active',
    },
  });
  const status = watch('status');
  const movedOut = (HOUSING_EXIT_STATUSES as readonly string[]).includes(status);

  useEffect(() => {
    if (open) {
      reset({
        participantProfileId: '',
        homeId: home?.id ?? '',
        moveInDate: todayInput(),
        status: 'active',
      });
      setParticipant(null);
      setTopError(null);
      setWarnings(null);
    }
  }, [open, home, reset]);

  const mutation = useMutation({
    mutationFn: (values: MoveInFormValues) =>
      api.post<HousingEnrollment & { warnings: string[] }>('/housing-enrollments', values),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['housing'] });
      // §6.4: over capacity / already housed WARN, never block — always shown.
      if (res.warnings?.length) setWarnings(res.warnings);
      else onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Move in resident</DialogTitle>
          {home ? <DialogDescription>{home.name}</DialogDescription> : null}
        </DialogHeader>
        {warnings ? (
          <div className="space-y-4">
            <p className="text-sm">Move-in recorded.</p>
            <WarningNotice warnings={warnings} />
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <FormErrorNotice message={topError} />
            <input type="hidden" {...register('participantProfileId')} />
            <FormField
              label="Participant"
              required
              error={
                errors.participantProfileId ? { message: 'Select a participant' } : undefined
              }
            >
              <ParticipantPicker
                queryScope="housing"
                value={participant}
                onSelect={(p) => {
                  setParticipant(p);
                  setValue('participantProfileId', p?.id ?? '', { shouldValidate: !!p });
                }}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {home ? (
                <input type="hidden" {...register('homeId')} />
              ) : (
                <FormField label="Home" required error={errors.homeId} className="sm:col-span-2">
                  <Select {...register('homeId')}>
                    <option value="">Select a home…</option>
                    {homeOptions.data?.map((h) => (
                      <option key={h.id} value={h.id}>
                        {homeOptionLabel(h)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              <FormField label="Move-in date" required error={errors.moveInDate}>
                <Input type="date" {...register('moveInDate')} />
              </FormField>
              <FormField
                label="Status"
                error={errors.status}
                hint="Use a moved-out status only when back-filling history"
              >
                <Select {...register('status')}>
                  {HOUSING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
              </FormField>
              {movedOut ? (
                <>
                  <FormField label="Move-out date" required error={errors.moveOutDate}>
                    <Input type="date" {...register('moveOutDate')} />
                  </FormField>
                  <FormField label="Reason for leaving" required error={errors.reasonForLeaving}>
                    <Input {...register('reasonForLeaving')} />
                  </FormField>
                  <FormField
                    label="Completion assessment"
                    required={status === 'completed'}
                    error={errors.completionAssessment}
                    hint='Required to mark completed — use "Assessment pending" until it is in'
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
                </>
              ) : null}
              <FormField label="Notes" error={errors.notes} className="sm:col-span-2">
                <Textarea rows={2} {...register('notes')} />
              </FormField>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Recording…' : 'Record Move-in'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
