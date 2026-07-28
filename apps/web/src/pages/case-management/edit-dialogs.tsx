import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  caseNoteSchema,
  caseServiceSchema,
  CONTACT_TYPES,
  needsAssessmentSchema,
  NOTE_CATEGORIES,
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
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { humanize } from '@/lib/utils';
import {
  applyFormErrors,
  zodForm,
  type CaseNoteRow,
  type CaseServiceRow,
  type NeedsAssessmentRow,
} from './shared';

/**
 * Row-level editors for the Case Notes / Services / Assessments lists.
 * Identity fields stay fixed; PATCHes run under case_management.update and
 * server-side ownership/confidentiality rules surface as form errors.
 */

const toDateInput = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

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

export function EditNoteDialog({
  note,
  onClose,
}: {
  note: CaseNoteRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const { register, handleSubmit, watch, setError, reset, formState } = useForm<NoteFormValues>({
    resolver: zodForm<NoteFormValues>(noteEditSchema),
  });
  const followUpRequired = watch('followUpRequired');

  useEffect(() => {
    if (note) {
      setTopError('');
      reset({
        noteDate: toDateInput(note.noteDate),
        category: note.category,
        contactType: note.contactType ?? CONTACT_TYPES[0],
        content: note.content,
        followUpRequired: note.followUpRequired ?? false,
        followUpDate: toDateInput(note.followUpDate),
        confidential: note.confidential,
      });
    }
  }, [note, reset]);

  const update = useMutation({
    mutationFn: (values: NoteFormValues) => api.patch(`/case-notes/${note?.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      onClose();
    },
    onError: (err) => setTopError(applyFormErrors(err, setError)),
  });

  return (
    <Dialog open={note !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit case note</DialogTitle>
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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

export function EditServiceDialog({
  service,
  onClose,
}: {
  service: CaseServiceRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const { register, handleSubmit, watch, setError, reset, formState } = useForm<ServiceFormValues>(
    { resolver: zodForm<ServiceFormValues>(serviceEditSchema) },
  );
  const followUpRequired = watch('followUpRequired');

  useEffect(() => {
    if (service) {
      setTopError('');
      reset({
        serviceType: service.serviceType,
        serviceDate: toDateInput(service.serviceDate),
        providerName: service.providerName ?? '',
        description: service.description ?? '',
        outcome: service.outcome ?? '',
        followUpRequired: service.followUpRequired,
        followUpDate: toDateInput(service.followUpDate),
        notes: service.notes ?? '',
      });
    }
  }, [service, reset]);

  const update = useMutation({
    mutationFn: (values: ServiceFormValues) => api.patch(`/case-services/${service?.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      onClose();
    },
    onError: (err) => setTopError(applyFormErrors(err, setError)),
  });

  return (
    <Dialog open={service !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit service</DialogTitle>
          <DialogDescription>Update this service record.</DialogDescription>
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Needs assessment ─────────────────────────────────────────────────────────

interface AssessmentFormValues {
  instrumentName: string;
  administeredAt: string;
  administeredByName: string;
  summary: string;
}

const assessmentEditSchema = needsAssessmentSchema.omit({
  participantProfileId: true,
  domainScores: true,
});

/** Standard assessment domains (§6.5) — stored as a domainScores record. */
const DOMAINS = [
  'housing',
  'employment',
  'substance_use',
  'mental_health',
  'transportation',
  'life_skills',
] as const;

export function EditAssessmentDialog({
  assessment,
  onClose,
}: {
  assessment: NeedsAssessmentRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const { register, handleSubmit, setError, reset, formState } = useForm<AssessmentFormValues>({
    resolver: zodForm<AssessmentFormValues>(assessmentEditSchema),
  });

  useEffect(() => {
    if (assessment) {
      setTopError('');
      reset({
        instrumentName: assessment.instrumentName,
        administeredAt: toDateInput(assessment.administeredAt),
        administeredByName: assessment.administeredByName ?? '',
        summary: assessment.summary ?? '',
      });
      setScores(
        Object.fromEntries(
          Object.entries(assessment.domainScores ?? {}).map(([k, v]) => [k, String(v)]),
        ),
      );
    }
  }, [assessment, reset]);

  const update = useMutation({
    mutationFn: (values: AssessmentFormValues) => {
      // Scores live outside RHF: only filled, numeric entries go into the record.
      const domainScores: Record<string, number> = {};
      for (const [domain, raw] of Object.entries(scores)) {
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n)) domainScores[domain] = n;
      }
      return api.patch(`/needs-assessments/${assessment?.id}`, { ...values, domainScores });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      onClose();
    },
    onError: (err) => setTopError(applyFormErrors(err, setError)),
  });

  const knownDomains = new Set<string>(DOMAINS);
  const extraDomains = Object.keys(scores).filter((d) => !knownDomains.has(d));

  return (
    <Dialog open={assessment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit needs assessment</DialogTitle>
          <DialogDescription>Update instrument results and domain scores.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError('');
            update.mutate(values);
          })}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Instrument" required error={formState.errors.instrumentName}>
              <Input {...register('instrumentName')} />
            </FormField>
            <FormField label="Administered on" required error={formState.errors.administeredAt}>
              <Input type="date" {...register('administeredAt')} />
            </FormField>
          </div>
          <FormField label="Administered by" error={formState.errors.administeredByName}>
            <Input {...register('administeredByName')} />
          </FormField>
          <div className="space-y-1.5">
            <Label>Domain scores</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3 sm:grid-cols-3">
              {[...DOMAINS, ...extraDomains].map((domain) => (
                <div key={domain} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{humanize(domain)}</Label>
                  <Input
                    type="number"
                    step="any"
                    className="h-8"
                    value={scores[domain] ?? ''}
                    onChange={(e) => setScores((s) => ({ ...s, [domain]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Leave a domain blank if not scored.</p>
          </div>
          <FormField label="Summary" error={formState.errors.summary}>
            <Textarea rows={3} {...register('summary')} />
          </FormField>
          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
