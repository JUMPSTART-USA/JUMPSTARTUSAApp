import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { travelRequestSchema, type TravelRequestStatus } from '@jumpstart/shared';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { api } from '@/lib/api';
import { applyApiError, formResolver, toDateInput } from '@/lib/form';
import { formatDate, fullName } from '@/lib/utils';
import type { PersonName } from './shared';

/**
 * GET /travel-requests list row. Shared by the module list page, the decision
 * dialog, and the participant profile Case Management tab card.
 */
export interface TravelRequestRow {
  id: string;
  participantProfileId: string;
  startDate: string;
  endDate: string;
  destination: string;
  purpose: string;
  status: TravelRequestStatus;
  decisionNotes: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
  participant: { person: PersonName };
}

/**
 * "Mar 3 – Mar 10, 2026" — the year renders once when both dates share it,
 * otherwise falls back to two full formatDate values.
 */
export function formatTravelDates(start: string, end: string): string {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s === e) return s;
  const year = /, (\d{4})$/.exec(s)?.[1];
  if (year && e.endsWith(`, ${year}`)) return `${s.slice(0, -year.length - 2)} – ${e}`;
  return `${s} – ${e}`;
}

interface TravelRequestFormValues {
  participantProfileId: string;
  startDate: string;
  endDate: string;
  destination: string;
  purpose: string;
}

/**
 * Create/edit dialog for travel-away requests. Create mode has two participant
 * flavors (mirroring DrugTestFormDialog):
 *  - `initialParticipant` given → locked to that participant (profile-tab use;
 *    the field is hidden when no label is available since the profile page
 *    already names the participant).
 *  - otherwise → shared ParticipantPicker (module page use).
 * Edit mode sends trip fields only — the API rejects edits once a decision has
 * been made, so callers should gate the edit affordance to pending rows.
 */
export function TravelRequestFormDialog({
  request,
  initialParticipant,
  onClose,
}: {
  /** 'new' opens the dialog in create mode. */
  request: TravelRequestRow | 'new' | null;
  /** When set, create mode is locked to this participant (profile use). */
  initialParticipant?: PickerOption | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const creating = request === 'new';
  const existing = request !== 'new' ? request : null;
  const locked = initialParticipant ?? null;

  const { register, handleSubmit, getValues, setValue, setError, reset, formState } =
    useForm<TravelRequestFormValues>({
      resolver: formResolver<TravelRequestFormValues>(travelRequestSchema),
    });

  useEffect(() => {
    if (request) {
      setTopError('');
      setParticipant(null);
      reset({
        participantProfileId: existing?.participantProfileId ?? locked?.id ?? '',
        startDate: existing ? toDateInput(existing.startDate) : '',
        endDate: existing ? toDateInput(existing.endDate) : '',
        destination: existing?.destination ?? '',
        purpose: existing?.purpose ?? '',
      });
    }
  }, [request, reset]);

  const save = useMutation({
    mutationFn: () => {
      // The resolver parses dates to Date objects; the API expects the raw
      // yyyy-mm-dd input strings, so build the payload from raw values.
      const raw = getValues();
      const payload = {
        startDate: raw.startDate,
        endDate: raw.endDate,
        destination: raw.destination.trim(),
        purpose: raw.purpose.trim(),
      };
      return creating
        ? api.post('/travel-requests', {
            ...payload,
            participantProfileId: raw.participantProfileId,
          })
        : api.patch(`/travel-requests/${existing?.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{creating ? 'New travel request' : 'Edit travel request'}</DialogTitle>
          <DialogDescription>
            {creating
              ? 'Request approval for a participant to travel away.'
              : 'Update the trip details of this pending request.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(() => {
            setTopError('');
            save.mutate();
          })}
        >
          {creating && !locked ? (
            <FormField
              label="Participant"
              required
              error={formState.errors.participantProfileId}
            >
              <ParticipantPicker
                value={participant}
                onChange={(p) => {
                  setParticipant(p);
                  setValue('participantProfileId', p?.id ?? '', { shouldValidate: !!p });
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
            <FormField label="Start date" required error={formState.errors.startDate}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" required error={formState.errors.endDate}>
              <Input type="date" {...register('endDate')} />
            </FormField>
          </div>
          <FormField label="Destination" required error={formState.errors.destination}>
            <Input {...register('destination')} />
          </FormField>
          <FormField label="Purpose" required error={formState.errors.purpose}>
            <Textarea rows={3} {...register('purpose')} />
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

/**
 * Decision dialog (case_management.update). Two flavors keyed off the row's
 * status: pending → Approve/Deny, approved → Cancel request. Both post to
 * /travel-requests/:id/decision; the API records who decided and when.
 */
export function TravelDecisionDialog({
  request,
  onClose,
}: {
  request: TravelRequestRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [topError, setTopError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<TravelRequestStatus | null>(null);
  const canceling = request?.status === 'approved';

  useEffect(() => {
    if (request) {
      setNotes(request.decisionNotes ?? '');
      setTopError(null);
      setPendingStatus(null);
    }
  }, [request]);

  const decide = useMutation({
    mutationFn: (status: 'approved' | 'denied' | 'canceled') =>
      api.post(`/travel-requests/${request?.id}/decision`, {
        status,
        decisionNotes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      onClose();
    },
    onError: (err) => {
      setPendingStatus(null);
      setTopError(applyApiError(err));
    },
  });

  const act = (status: 'approved' | 'denied' | 'canceled') => {
    setTopError(null);
    setPendingStatus(status);
    decide.mutate(status);
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{canceling ? 'Cancel travel request' : 'Review travel request'}</DialogTitle>
          <DialogDescription>
            {canceling
              ? 'Cancel this approved travel request. The trip will no longer be authorized.'
              : 'Approve or deny this travel-away request.'}
          </DialogDescription>
        </DialogHeader>
        {request ? (
          <div className="space-y-4">
            <DescriptionList>
              <InfoItem label="Participant">{fullName(request.participant.person)}</InfoItem>
              <InfoItem label="Dates">
                {formatTravelDates(request.startDate, request.endDate)}
              </InfoItem>
              <InfoItem label="Destination">{request.destination}</InfoItem>
              <InfoItem label="Status">
                <StatusBadge status={request.status} />
              </InfoItem>
              <InfoItem label="Purpose" className="sm:col-span-2">
                <span className="whitespace-pre-wrap">{request.purpose}</span>
              </InfoItem>
            </DescriptionList>
            <FormField label="Decision notes">
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
            <FormError message={topError} />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={decide.isPending} onClick={onClose}>
                Close
              </Button>
              {canceling ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={decide.isPending}
                  onClick={() => act('canceled')}
                >
                  {pendingStatus === 'canceled' ? 'Saving…' : 'Cancel request'}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={decide.isPending}
                    onClick={() => act('denied')}
                  >
                    {pendingStatus === 'denied' ? 'Saving…' : 'Deny'}
                  </Button>
                  <Button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => act('approved')}
                  >
                    {pendingStatus === 'approved' ? 'Saving…' : 'Approve'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
