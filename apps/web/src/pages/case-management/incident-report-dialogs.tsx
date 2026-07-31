import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABELS,
  incidentReportSchema,
  type IncidentCategory,
  type IncidentSeverity,
  type IncidentStatus,
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

/**
 * GET /incident-reports list row. VIEW responses (POST/PATCH) carry the same
 * fields minus `participant`, which only list rows include. Shared by the
 * module list page and the participant profile Case Management tab card.
 */
export interface IncidentReportRow {
  id: string;
  participantProfileId: string;
  incidentDate: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  description: string;
  actionTaken: string | null;
  status: IncidentStatus;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  participant: { person: { firstName: string; lastName: string } };
}

/** Statuses that close an incident — resolution notes are shown for these. */
export function isClosedIncidentStatus(status: string): boolean {
  return status === 'resolved' || status === 'dismissed';
}

/**
 * Client-side validation schema: incidentReportSchema minus the participant FK
 * (the picker is validated locally, mirroring DrugTestFormDialog), with the
 * not-in-the-future refinement re-applied after innerType()/omit().
 */
const incidentFormSchema = incidentReportSchema
  .innerType()
  .omit({ participantProfileId: true })
  .superRefine((val, ctx) => {
    if (val.incidentDate && val.incidentDate > new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Incident date cannot be in the future',
        path: ['incidentDate'],
      });
    }
  });

interface IncidentReportFormValues {
  incidentDate: string;
  category: string;
  severity: string;
  description: string;
  actionTaken: string;
  status: string;
  resolutionNotes: string;
}

/**
 * Create/edit dialog for incident reports (program rules violations).
 *
 * Create mode has two participant flavors, mirroring DrugTestFormDialog:
 *  - `initialParticipant` given → locked to that participant (participant
 *    profile use; the field is hidden when no label is available since the
 *    profile page already names the participant).
 *  - otherwise → shared ParticipantPicker (module page use), validated locally
 *    before submit since the form schema omits participantProfileId.
 *
 * Resolution notes only render (and only submit) when the selected status is
 * resolved/dismissed; the API stamps/clears resolvedAt from status itself.
 */
export function IncidentReportFormDialog({
  report,
  initialParticipant,
  onClose,
}: {
  /** 'new' opens the dialog in create mode. */
  report: IncidentReportRow | 'new' | null;
  /** When set, create mode is locked to this participant (profile use). */
  initialParticipant?: PickerOption | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [participantError, setParticipantError] = useState('');
  const creating = report === 'new';
  const existing = report !== 'new' ? report : null;
  const locked = initialParticipant ?? null;

  const { register, handleSubmit, getValues, setError, reset, watch, formState } =
    useForm<IncidentReportFormValues>({ resolver: formResolver(incidentFormSchema) });

  const closed = isClosedIncidentStatus(watch('status') ?? '');

  useEffect(() => {
    if (report) {
      setTopError('');
      setParticipant(null);
      setParticipantError('');
      reset({
        incidentDate: existing ? toDateInput(existing.incidentDate) : todayInput(),
        category: existing?.category ?? '',
        severity: existing?.severity ?? '',
        description: existing?.description ?? '',
        actionTaken: existing?.actionTaken ?? '',
        status: existing?.status ?? 'open',
        resolutionNotes: existing?.resolutionNotes ?? '',
      });
    }
  }, [report, reset]);

  const save = useMutation({
    mutationFn: () => {
      // The schema parses incidentDate to a Date; the API coerces the raw
      // yyyy-mm-dd input string itself, so build the payload from raw values.
      const raw = getValues();
      const nowClosed = isClosedIncidentStatus(raw.status);
      const payload = {
        ...(creating ? { participantProfileId: locked?.id ?? participant?.id } : {}),
        incidentDate: raw.incidentDate,
        category: raw.category,
        severity: raw.severity,
        description: raw.description.trim(),
        actionTaken: raw.actionTaken.trim() || undefined,
        status: raw.status,
        resolutionNotes:
          nowClosed && raw.resolutionNotes.trim() ? raw.resolutionNotes.trim() : undefined,
      };
      return creating
        ? api.post<IncidentReportRow>('/incident-reports', payload)
        : api.patch<IncidentReportRow>(`/incident-reports/${existing?.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  return (
    <Dialog open={report !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{creating ? 'Report incident' : 'Edit incident report'}</DialogTitle>
          <DialogDescription>
            {creating
              ? 'Report a program rules incident for a participant.'
              : 'Update this incident report.'}
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
            <FormField label="Incident date" required error={formState.errors.incidentDate}>
              <Input type="date" {...register('incidentDate')} />
            </FormField>
            <FormField label="Category" required error={formState.errors.category}>
              <Select {...register('category')}>
                <option value="">Select…</option>
                {INCIDENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {INCIDENT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Severity" required error={formState.errors.severity}>
              <Select {...register('severity')}>
                <option value="">Select…</option>
                {INCIDENT_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {INCIDENT_SEVERITY_LABELS[s]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status" error={formState.errors.status}>
              <Select {...register('status')}>
                {INCIDENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {INCIDENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Description" required error={formState.errors.description}>
            <Textarea rows={4} {...register('description')} />
          </FormField>
          <FormField label="Action taken" error={formState.errors.actionTaken}>
            <Textarea rows={3} {...register('actionTaken')} />
          </FormField>
          {closed ? (
            <FormField label="Resolution notes" error={formState.errors.resolutionNotes}>
              <Textarea rows={3} {...register('resolutionNotes')} />
            </FormField>
          ) : null}
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
