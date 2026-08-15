import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  DRUG_TEST_RESULT_LABELS,
  DRUG_TEST_RESULTS,
  DRUG_TEST_TYPE_LABELS,
  DRUG_TEST_TYPES,
  drugTestSchema,
  PROFILE_PHOTO_ACCEPT,
} from '@jumpstart/shared';
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
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { api } from '@/lib/api';
import { applyApiError, formResolver, toDateInput, todayInput } from '@/lib/form';
import type { DrugTestRow } from './shared';

/**
 * Create/edit dialog for drug tests (case management). Submits
 * multipart/form-data so the optional results photo travels with the record;
 * the photo file lives in component state, not the RHF form.
 *
 * Create mode has two participant flavors:
 *  - `initialParticipant` given → locked to that participant (participant
 *    profile use; the field is hidden when no label is available since the
 *    profile page already names the participant).
 *  - otherwise → shared ParticipantPicker (module page use), mirroring
 *    RecordServiceDialog. drugTestSchema doesn't cover participantProfileId,
 *    so the picker is validated locally before submit.
 */

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

interface DrugTestFormValues {
  testDate: string;
  testType: string;
  result: string;
  notes: string;
}

export function DrugTestFormDialog({
  test,
  initialParticipant,
  onClose,
}: {
  /** 'new' opens the dialog in create mode. */
  test: DrugTestRow | 'new' | null;
  /** When set, create mode is locked to this participant (profile use). */
  initialParticipant?: PickerOption | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [participantError, setParticipantError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const creating = test === 'new';
  const existing = test !== 'new' ? test : null;
  const locked = initialParticipant ?? null;

  const { register, handleSubmit, getValues, setError, reset, formState } =
    useForm<DrugTestFormValues>({ resolver: formResolver(drugTestSchema) });

  useEffect(() => {
    if (test) {
      setTopError('');
      setPhoto(null);
      setPhotoError('');
      setParticipant(null);
      setParticipantError('');
      if (fileRef.current) fileRef.current.value = '';
      reset({
        testDate: existing ? toDateInput(existing.testDate) : todayInput(),
        testType: existing?.testType ?? '',
        result: existing?.result ?? '',
        notes: existing?.notes ?? '',
      });
    }
  }, [test, reset]);

  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && !file.type.startsWith('image/')) {
      setPhotoError('Photo must be an image file.');
      setPhoto(null);
      e.target.value = '';
      return;
    }
    if (file && file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Photo must be 10 MB or smaller.');
      setPhoto(null);
      e.target.value = '';
      return;
    }
    setPhotoError('');
    setPhoto(file);
  };

  const save = useMutation({
    mutationFn: () => {
      // The schema parses testDate to a Date; the API expects the raw
      // yyyy-mm-dd input string, so build the payload from raw values.
      const raw = getValues();
      const fd = new FormData();
      if (creating) fd.append('participantProfileId', locked?.id ?? participant?.id ?? '');
      fd.append('testDate', raw.testDate);
      fd.append('testType', raw.testType);
      fd.append('result', raw.result);
      if (raw.notes.trim()) fd.append('notes', raw.notes.trim());
      if (photo) fd.append('photo', photo);
      return creating
        ? api.post<DrugTestRow>('/drug-tests', fd)
        : api.patch<DrugTestRow>(`/drug-tests/${existing?.id}`, fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  return (
    <Dialog open={test !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{creating ? 'Record drug test' : 'Edit drug test'}</DialogTitle>
          <DialogDescription>
            {creating
              ? 'Record a drug test for a participant.'
              : 'Update this drug test record.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(() => {
            if (creating && !locked && !participant) {
              setParticipantError('Select a participant.');
              return;
            }
            setTopError('');
            save.mutate();
          })}
        >
          {creating && !locked ? (
            <FormField
              label="Participant"
              required
              error={participantError ? { message: participantError } : undefined}
            >
              <ParticipantPicker
                value={participant}
                onChange={(p) => {
                  setParticipant(p);
                  if (p) setParticipantError('');
                }}
              />
            </FormField>
          ) : null}
          {creating && locked?.label ? (
            <FormField label="Participant">
              <Input value={locked.label} disabled readOnly />
            </FormField>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Test date" required error={formState.errors.testDate}>
              <Input type="date" {...register('testDate')} />
            </FormField>
            <FormField label="Type" required error={formState.errors.testType}>
              <Select {...register('testType')}>
                <option value="">Select…</option>
                {DRUG_TEST_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DRUG_TEST_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Result" required error={formState.errors.result}>
            <Select {...register('result')}>
              <option value="">Select…</option>
              {DRUG_TEST_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {DRUG_TEST_RESULT_LABELS[r]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>
          <FormField
            label="Photo of results"
            error={photoError ? { message: photoError } : undefined}
            hint={
              existing?.hasPhoto
                ? 'Choosing a new file replaces the current photo.'
                : 'Optional. Image files up to 10 MB.'
            }
          >
            <>
              <Input
                ref={fileRef}
                type="file"
                // The shared list, not "image/*": the API refuses SVG (a
                // document that can carry script), so offering it in the
                // picker only produces a rejection the user cannot explain.
                accept={PROFILE_PHOTO_ACCEPT}
                capture="environment"
                className="file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
                onChange={onPhotoChange}
              />
              {existing?.hasPhoto ? (
                <p className="text-sm text-muted-foreground">
                  Current photo:{' '}
                  <a
                    href={`/api/drug-tests/${existing.id}/photo`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    View
                  </a>
                </p>
              ) : null}
            </>
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting || save.isPending}>
              {save.isPending ? 'Saving…' : creating ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
