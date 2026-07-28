import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { caseNoteSchema, caseServiceSchema, CONTACT_TYPES, NOTE_CATEGORIES } from '@jumpstart/shared';
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
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { humanize } from '@/lib/utils';
import { applyApiError, schemaResolver, toDateInput } from './shared';
import type { CaseNoteRow, CaseServiceRow } from './types';

/**
 * In-place editors for the Services and Notes tabs (§6.1). Identity fields
 * stay fixed — these PATCH the record under case_management.update; ownership
 * and confidentiality rules are enforced server-side and surface as form
 * errors.
 */

// ── Case service ─────────────────────────────────────────────────────────────

interface ServiceFormValues {
  serviceType: string;
  serviceDate: string;
  providerName: string;
  description: string;
  outcome: string;
  followUpRequired: boolean;
  followUpDate: string;
  notes: string;
}

const serviceEditSchema = caseServiceSchema.omit({ participantProfileId: true });

export function ServiceEditDialog({
  service,
  participantId,
  onClose,
}: {
  /** 'new' opens the dialog in create mode. */
  service: CaseServiceRow | 'new' | null;
  participantId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const creating = service === 'new';
  const existing = service !== 'new' ? service : null;

  const { register, handleSubmit, watch, setError, reset, formState } = useForm<ServiceFormValues>(
    { resolver: schemaResolver(serviceEditSchema) },
  );
  const followUpRequired = watch('followUpRequired');

  useEffect(() => {
    if (service) {
      setTopError('');
      setConfirmDelete(false);
      reset({
        serviceType: existing?.serviceType ?? '',
        serviceDate: existing ? toDateInput(existing.serviceDate) : toDateInput(new Date().toISOString()),
        providerName: existing?.providerName ?? '',
        description: existing?.description ?? '',
        outcome: existing?.outcome ?? '',
        followUpRequired: existing?.followUpRequired ?? false,
        followUpDate: existing ? toDateInput(existing.followUpDate) : '',
        notes: existing?.notes ?? '',
      });
    }
  }, [service, reset]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['participants', participantId] });
    queryClient.invalidateQueries({ queryKey: ['case-management'] });
  };

  const update = useMutation({
    mutationFn: (values: ServiceFormValues) =>
      creating
        ? api.post('/case-services', { ...values, participantProfileId: participantId })
        : api.patch(`/case-services/${existing?.id}`, values),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/case-services/${existing?.id}`),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  return (
    <Dialog open={service !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{creating ? 'Record service' : 'Edit service'}</DialogTitle>
          <DialogDescription>
            {creating ? 'Record a service provided to this participant.' : 'Update this service record.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError('');
            update.mutate(values);
          })}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Service type" required error={formState.errors.serviceType}>
              <Input {...register('serviceType')} />
            </FormField>
            <FormField label="Service date" required error={formState.errors.serviceDate}>
              <Input type="date" {...register('serviceDate')} />
            </FormField>
          </div>
          <FormField label="Provider" error={formState.errors.providerName}>
            <Input {...register('providerName')} />
          </FormField>
          <FormField label="Description" error={formState.errors.description}>
            <Textarea rows={2} {...register('description')} />
          </FormField>
          <FormField label="Outcome" error={formState.errors.outcome}>
            <Input {...register('outcome')} />
          </FormField>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Checkbox {...register('followUpRequired')} /> Follow-up required
            </Label>
            {followUpRequired ? (
              <FormField label="Follow-up date" required error={formState.errors.followUpDate}>
                <Input type="date" {...register('followUpDate')} />
              </FormField>
            ) : null}
          </div>
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>
          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}
          <DialogFooter className="sm:justify-between">
            {!creating ? (
              <Button
                type="button"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
              >
                {remove.isPending
                  ? 'Deleting…'
                  : confirmDelete
                    ? 'Click again to confirm'
                    : 'Delete'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={formState.isSubmitting || update.isPending}>
                {update.isPending ? 'Saving…' : creating ? 'Record service' : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Case note ────────────────────────────────────────────────────────────────

interface NoteFormValues {
  noteDate: string;
  category: string;
  contactType: string;
  content: string;
  followUpRequired: boolean;
  followUpDate: string;
  confidential: boolean;
}

const noteEditSchema = caseNoteSchema.innerType().omit({ participantProfileId: true });

export function NoteEditDialog({
  note,
  participantId,
  onClose,
}: {
  /** 'new' opens the dialog in create mode. */
  note: CaseNoteRow | 'new' | null;
  participantId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const creating = note === 'new';
  const existing = note !== 'new' ? note : null;

  const { register, handleSubmit, watch, setError, reset, formState } = useForm<NoteFormValues>({
    resolver: schemaResolver(noteEditSchema),
  });
  const followUpRequired = watch('followUpRequired');

  useEffect(() => {
    if (note) {
      setTopError('');
      setConfirmDelete(false);
      reset({
        noteDate: existing ? toDateInput(existing.noteDate) : toDateInput(new Date().toISOString()),
        category: existing?.category ?? NOTE_CATEGORIES[0],
        contactType: existing?.contactType ?? CONTACT_TYPES[0],
        content: existing?.content ?? '',
        followUpRequired: existing?.followUpRequired ?? false,
        followUpDate: existing ? toDateInput(existing.followUpDate) : '',
        confidential: existing?.confidential ?? false,
      });
    }
  }, [note, reset]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['participants', participantId] });
    queryClient.invalidateQueries({ queryKey: ['case-management'] });
  };

  const update = useMutation({
    mutationFn: (values: NoteFormValues) =>
      creating
        ? api.post('/case-notes', { ...values, participantProfileId: participantId })
        : api.patch(`/case-notes/${existing?.id}`, values),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/case-notes/${existing?.id}`),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  return (
    <Dialog open={note !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{creating ? 'Add case note' : 'Edit case note'}</DialogTitle>
          <DialogDescription>
            Changes are audited; confidentiality rules still apply.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError('');
            update.mutate(values);
          })}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Date" required error={formState.errors.noteDate}>
              <Input type="date" {...register('noteDate')} />
            </FormField>
            <FormField label="Category" required error={formState.errors.category}>
              <Select {...register('category')}>
                {NOTE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Contact type" required error={formState.errors.contactType}>
              <Select {...register('contactType')}>
                {CONTACT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Note" required error={formState.errors.content}>
            <Textarea rows={5} {...register('content')} />
          </FormField>
          <div className="flex flex-wrap items-center gap-6">
            <Label className="flex items-center gap-2">
              <Checkbox {...register('followUpRequired')} /> Follow-up required
            </Label>
            <Label className="flex items-center gap-2">
              <Checkbox {...register('confidential')} /> Confidential
            </Label>
          </div>
          {followUpRequired ? (
            <FormField label="Follow-up date" required error={formState.errors.followUpDate}>
              <Input type="date" {...register('followUpDate')} />
            </FormField>
          ) : null}
          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}
          <DialogFooter className="sm:justify-between">
            {!creating ? (
              <Button
                type="button"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
              >
                {remove.isPending
                  ? 'Deleting…'
                  : confirmDelete
                    ? 'Click again to confirm'
                    : 'Delete'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={formState.isSubmitting || update.isPending}>
                {update.isPending ? 'Saving…' : creating ? 'Add note' : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
