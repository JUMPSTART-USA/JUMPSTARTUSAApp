import { participantUpdateSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver } from '@/lib/form';
import {
  participantToFormValues,
  PersonFields,
  ProfileFields,
  type ParticipantFormValues,
} from './person-form';
import { useCaseManagerOptions } from './shared';
import type { ParticipantDetail } from './types';

/** Update semantics (participantUpdateSchema): null clears, undefined = no change. */
const CLEARABLE_PROFILE = new Set<keyof ParticipantFormValues['profile']>([
  'intakeDate',
  'releaseDate',
  'graduationDate',
  'assignedCaseManagerId',
]);

/** Person fields with clearable schema variants — blanking one clears it. */
const CLEARABLE_PERSON = new Set<keyof ParticipantFormValues['person']>([
  'facebookUrl',
  'instagramUrl',
  'twitterUrl',
  'linkedinUrl',
  'tiktokUrl',
  'youtubeUrl',
  'mailingAddressLine1',
  'mailingAddressLine2',
  'mailingCity',
  'mailingState',
  'mailingZip',
]);

type DirtyMap = { [k: string]: boolean | undefined };

/** Only send changed fields; '' on a clearable field becomes null. */
function buildUpdatePayload(
  raw: ParticipantFormValues,
  dirty: { person?: DirtyMap; profile?: DirtyMap },
): { person?: Record<string, unknown>; profile?: Record<string, unknown> } | null {
  const person: Record<string, unknown> = {};
  for (const key of Object.keys(dirty.person ?? {}) as (keyof ParticipantFormValues['person'])[]) {
    const value = raw.person[key];
    if (typeof value === 'boolean') {
      person[key] = value;
      continue;
    }
    // The legacy person text fields have no clearable variants — a blanked
    // one is simply not sent; the social/mailing fields DO clear (null).
    if (value === '') {
      if (CLEARABLE_PERSON.has(key)) person[key] = null;
      continue;
    }
    person[key] = value;
  }

  const profile: Record<string, unknown> = {};
  for (const key of Object.keys(dirty.profile ?? {}) as (keyof ParticipantFormValues['profile'])[]) {
    const value = raw.profile[key];
    if (value === '') {
      if (CLEARABLE_PROFILE.has(key)) profile[key] = null;
      continue;
    }
    profile[key] = value;
  }

  const payload: { person?: Record<string, unknown>; profile?: Record<string, unknown> } = {};
  if (Object.keys(person).length) payload.person = person;
  if (Object.keys(profile).length) payload.profile = profile;
  return Object.keys(payload).length ? payload : null;
}

export function EditParticipantDialog({
  participant,
  open,
  onOpenChange,
}: {
  participant: ParticipantDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { options: cmOptions } = useCaseManagerOptions(
    participant.assignedCaseManager
      ? {
          id: participant.assignedCaseManager.id,
          name: `${participant.assignedCaseManager.firstName} ${participant.assignedCaseManager.lastName}`,
        }
      : null,
  );
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<ParticipantFormValues>({
    resolver: formResolver<ParticipantFormValues>(participantUpdateSchema),
    defaultValues: participantToFormValues(participant),
  });

  useEffect(() => {
    if (open) {
      form.reset(participantToFormValues(participant));
      setTopError(null);
    }
  }, [open, participant, form]);

  const updateMutation = useMutation({
    mutationFn: (body: object) => api.patch<ParticipantDetail>(`/participants/${participant.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['participants'] });
      onOpenChange(false);
    },
    onError: (err) => {
      const message = applyApiError(err, form.setError);
      if (message) setTopError(message);
    },
  });

  const submit = form.handleSubmit(() => {
    setTopError(null);
    // handleSubmit validated via the shared schema; the payload is built from
    // the RAW values + dirtyFields so only changed fields are sent.
    const payload = buildUpdatePayload(form.getValues(), form.formState.dirtyFields);
    if (!payload) {
      onOpenChange(false);
      return;
    }
    updateMutation.mutate(payload);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent unsavedChanges={form.formState.isDirty} size="2xl">
        <DialogHeader>
          <DialogTitle>Edit participant</DialogTitle>
          <DialogDescription>
            Only changed fields are saved. Status and phase changes are appended to the status
            history.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-6"
        >
          <div>
            <p className="mb-3 text-sm font-semibold">Person</p>
            <PersonFields form={form} />
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">Program profile</p>
            <ProfileFields form={form} cmOptions={cmOptions} mode="edit" />
          </div>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
