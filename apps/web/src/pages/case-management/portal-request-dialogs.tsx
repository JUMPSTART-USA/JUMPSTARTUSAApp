import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import type {
  MeetingRequestStatus,
  PortalMessageStatus,
  TransportRequestStatus,
} from '@jumpstart/shared';
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
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form';
import { formatDate, fullName } from '@/lib/utils';
import type { PersonName } from './shared';

// ── Response shapes (portal review queues — rows include the participant
// summary like /drug-tests rows) ────────────────────────────────────────────

/** GET /portal-messages list row. */
export interface PortalMessageRow {
  id: string;
  participantProfileId: string;
  subject: string | null;
  body: string;
  status: PortalMessageStatus;
  staffNotes: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  participant: { person: PersonName };
}

/** GET /meeting-requests list row. */
export interface MeetingRequestRow {
  id: string;
  participantProfileId: string;
  preferredDate: string;
  preferredTime: string | null;
  reason: string;
  status: MeetingRequestStatus;
  scheduledFor: string | null;
  decisionNotes: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
  participant: { person: PersonName };
}

/** GET /transport-requests list row. */
export interface TransportRequestRow {
  id: string;
  participantProfileId: string;
  tripDate: string;
  tripTime: string;
  destination: string;
  purpose: string | null;
  returnTripRequested: boolean;
  returnDate: string | null;
  returnTime: string | null;
  returnDestination: string | null;
  status: TransportRequestStatus;
  assignedVehicleId: string | null;
  /** Present when the API includes the vehicle relation; rendered defensively. */
  assignedVehicle?: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  } | null;
  decisionNotes: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
  participant: { person: PersonName };
}

/** '14:30' → '2:30 PM' — portal times are stored as 24-hour HH:MM strings. */
export function formatClockTime(time: string | null | undefined): string {
  if (!time) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "Mar 3, 2026 · 2:30 PM" (time part omitted when absent). */
export function formatDateAndClock(date: string, time: string | null | undefined): string {
  const t = formatClockTime(time);
  return t ? `${formatDate(date)} · ${t}` : formatDate(date);
}

const fmtDateTime = (value: string) => format(new Date(value), 'MMM d, yyyy h:mm a');

/**
 * Review dialog for portal messages (case_management.update to act; read-only
 * view otherwise). Mark read / mark responded PATCH /portal-messages/:id —
 * the API stamps reviewedById/At when a message moves off 'new'.
 */
export function MessageReviewDialog({
  message,
  onClose,
}: {
  message: PortalMessageRow | null;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [topError, setTopError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<PortalMessageStatus | null>(null);
  const canUpdate = can('case_management.update');
  const actionable = canUpdate && message !== null && message.status !== 'responded';

  useEffect(() => {
    if (message) {
      setNotes(message.staffNotes ?? '');
      setTopError(null);
      setPendingStatus(null);
    }
  }, [message]);

  const update = useMutation({
    mutationFn: (status: PortalMessageStatus) =>
      api.patch(`/portal-messages/${message?.id}`, {
        status,
        staffNotes: notes.trim() || undefined,
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

  const act = (status: PortalMessageStatus) => {
    setTopError(null);
    setPendingStatus(status);
    update.mutate(status);
  };

  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Portal message</DialogTitle>
          <DialogDescription>
            Message sent by the participant through their portal link.
          </DialogDescription>
        </DialogHeader>
        {message ? (
          <div className="space-y-4">
            <DescriptionList>
              <InfoItem label="Participant">{fullName(message.participant.person)}</InfoItem>
              <InfoItem label="Received">{fmtDateTime(message.createdAt)}</InfoItem>
              <InfoItem label="Status">
                <StatusBadge status={message.status} />
              </InfoItem>
              {message.subject ? <InfoItem label="Subject">{message.subject}</InfoItem> : null}
              <InfoItem label="Message" className="sm:col-span-2">
                <span className="whitespace-pre-wrap">{message.body}</span>
              </InfoItem>
              {!actionable && message.staffNotes ? (
                <InfoItem label="Staff notes" className="sm:col-span-2">
                  <span className="whitespace-pre-wrap">{message.staffNotes}</span>
                </InfoItem>
              ) : null}
            </DescriptionList>
            {actionable ? (
              <FormField label="Staff notes" hint="Internal only — the participant never sees these.">
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </FormField>
            ) : null}
            <FormError message={topError} />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={update.isPending} onClick={onClose}>
                Close
              </Button>
              {actionable && message.status === 'new' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() => act('read')}
                >
                  {pendingStatus === 'read' ? 'Saving…' : 'Mark read'}
                </Button>
              ) : null}
              {actionable ? (
                <Button type="button" disabled={update.isPending} onClick={() => act('responded')}>
                  {pendingStatus === 'responded' ? 'Saving…' : 'Mark responded'}
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Decision dialog for meeting requests. Flavors keyed off the row's status:
 * pending → Schedule (requires a date) / Decline, scheduled → Cancel meeting,
 * terminal → read-only. Posts to /meeting-requests/:id/decision; the API
 * stamps decidedById/At.
 */
export function MeetingDecisionDialog({
  request,
  onClose,
}: {
  request: MeetingRequestRow | null;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [scheduledFor, setScheduledFor] = useState('');
  const [notes, setNotes] = useState('');
  const [topError, setTopError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<MeetingRequestStatus | null>(null);
  const canUpdate = can('case_management.update');
  const deciding = canUpdate && request?.status === 'pending';
  const canceling = canUpdate && request?.status === 'scheduled';

  useEffect(() => {
    if (request) {
      setScheduledFor('');
      setNotes(request.decisionNotes ?? '');
      setTopError(null);
      setPendingStatus(null);
    }
  }, [request]);

  const decide = useMutation({
    mutationFn: (payload: {
      status: MeetingRequestStatus;
      scheduledFor?: string;
      decisionNotes?: string;
    }) => api.post(`/meeting-requests/${request?.id}/decision`, payload),
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

  const act = (status: MeetingRequestStatus) => {
    if (status === 'scheduled' && !scheduledFor) {
      setTopError('Pick a date to schedule this meeting.');
      return;
    }
    setTopError(null);
    setPendingStatus(status);
    decide.mutate({
      status,
      scheduledFor: status === 'scheduled' ? scheduledFor : undefined,
      decisionNotes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {deciding ? 'Review meeting request' : canceling ? 'Cancel meeting' : 'Meeting request'}
          </DialogTitle>
          <DialogDescription>
            {deciding
              ? 'Schedule or decline this meeting request.'
              : canceling
                ? 'Cancel this scheduled meeting.'
                : 'Meeting request details.'}
          </DialogDescription>
        </DialogHeader>
        {request ? (
          <div className="space-y-4">
            <DescriptionList>
              <InfoItem label="Participant">{fullName(request.participant.person)}</InfoItem>
              <InfoItem label="Requested for">
                {formatDateAndClock(request.preferredDate, request.preferredTime)}
              </InfoItem>
              <InfoItem label="Status">
                <StatusBadge status={request.status} />
              </InfoItem>
              <InfoItem label="Submitted">{formatDate(request.createdAt)}</InfoItem>
              {request.scheduledFor ? (
                <InfoItem label="Scheduled for">{formatDate(request.scheduledFor)}</InfoItem>
              ) : null}
              <InfoItem label="Reason" className="sm:col-span-2">
                <span className="whitespace-pre-wrap">{request.reason}</span>
              </InfoItem>
              {!deciding && !canceling && request.decisionNotes ? (
                <InfoItem label="Decision notes" className="sm:col-span-2">
                  <span className="whitespace-pre-wrap">{request.decisionNotes}</span>
                </InfoItem>
              ) : null}
            </DescriptionList>
            {deciding ? (
              <FormField label="Schedule for" hint="Required to schedule the meeting.">
                <Input
                  type="date"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </FormField>
            ) : null}
            {deciding || canceling ? (
              <FormField
                label="Decision notes"
                hint="Optional — include the meeting time or location here."
              >
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </FormField>
            ) : null}
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
                  {pendingStatus === 'canceled' ? 'Saving…' : 'Cancel meeting'}
                </Button>
              ) : null}
              {deciding ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={decide.isPending}
                    onClick={() => act('declined')}
                  >
                    {pendingStatus === 'declined' ? 'Saving…' : 'Decline'}
                  </Button>
                  <Button type="button" disabled={decide.isPending} onClick={() => act('scheduled')}>
                    {pendingStatus === 'scheduled' ? 'Saving…' : 'Schedule'}
                  </Button>
                </>
              ) : null}
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface VehicleOptionRow {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
}

const vehicleLabel = (v: VehicleOptionRow) =>
  `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` · ${v.licensePlate}` : ''}`;

/**
 * Decision dialog for transportation requests. Flavors keyed off status:
 * pending → Approve (optional vehicle assignment) / Deny, approved →
 * Complete / Cancel, terminal → read-only. Posts to
 * /transport-requests/:id/decision; the API stamps decidedById/At.
 */
export function TransportDecisionDialog({
  request,
  onClose,
}: {
  request: TransportRequestRow | null;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');
  const [topError, setTopError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<TransportRequestStatus | null>(null);
  const canUpdate = can('case_management.update');
  const deciding = canUpdate && request?.status === 'pending';
  const managing = canUpdate && request?.status === 'approved';

  useEffect(() => {
    if (request) {
      setVehicleId(request.assignedVehicleId ?? '');
      setNotes(request.decisionNotes ?? '');
      setTopError(null);
      setPendingStatus(null);
    }
  }, [request]);

  // Active fleet for the optional assignment select — only fetched while a
  // pending request is open for review.
  const vehiclesQuery = useQuery({
    queryKey: ['fleet', 'vehicles', 'options'],
    queryFn: () =>
      api.get<Paged<VehicleOptionRow>>(
        `/vehicles${qs({ active: 'true', pageSize: 100, sortBy: 'make', sortDir: 'asc' })}`,
      ),
    enabled: Boolean(deciding),
  });

  const decide = useMutation({
    mutationFn: (payload: {
      status: TransportRequestStatus;
      assignedVehicleId?: string;
      decisionNotes?: string;
    }) => api.post(`/transport-requests/${request?.id}/decision`, payload),
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

  const act = (status: TransportRequestStatus) => {
    setTopError(null);
    setPendingStatus(status);
    decide.mutate({
      status,
      assignedVehicleId: status === 'approved' ? vehicleId || undefined : undefined,
      decisionNotes: notes.trim() || undefined,
    });
  };

  const assignedVehicle = request?.assignedVehicle;

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {deciding
              ? 'Review transportation request'
              : managing
                ? 'Manage transportation request'
                : 'Transportation request'}
          </DialogTitle>
          <DialogDescription>
            {deciding
              ? 'Approve or deny this ride request. Assigning a vehicle is optional.'
              : managing
                ? 'Mark this approved trip completed, or cancel it.'
                : 'Transportation request details.'}
          </DialogDescription>
        </DialogHeader>
        {request ? (
          <div className="space-y-4">
            <DescriptionList>
              <InfoItem label="Participant">{fullName(request.participant.person)}</InfoItem>
              <InfoItem label="Trip">
                {formatDateAndClock(request.tripDate, request.tripTime)}
              </InfoItem>
              <InfoItem label="Destination">{request.destination}</InfoItem>
              <InfoItem label="Status">
                <StatusBadge status={request.status} />
              </InfoItem>
              <InfoItem label="Return trip" className="sm:col-span-2">
                {request.returnTripRequested && request.returnDate ? (
                  <>
                    {formatDateAndClock(request.returnDate, request.returnTime)}
                    {request.returnDestination ? ` → ${request.returnDestination}` : ''}
                  </>
                ) : (
                  'Not requested'
                )}
              </InfoItem>
              {request.purpose ? (
                <InfoItem label="Purpose" className="sm:col-span-2">
                  <span className="whitespace-pre-wrap">{request.purpose}</span>
                </InfoItem>
              ) : null}
              {assignedVehicle ? (
                <InfoItem label="Assigned vehicle">{vehicleLabel(assignedVehicle)}</InfoItem>
              ) : null}
              {!deciding && !managing && request.decisionNotes ? (
                <InfoItem label="Decision notes" className="sm:col-span-2">
                  <span className="whitespace-pre-wrap">{request.decisionNotes}</span>
                </InfoItem>
              ) : null}
            </DescriptionList>
            {deciding ? (
              <FormField label="Assign vehicle" hint="Optional — applies when approving.">
                <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">No vehicle assigned</option>
                  {(vehiclesQuery.data?.items ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleLabel(v)}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
            {deciding || managing ? (
              <FormField label="Decision notes">
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </FormField>
            ) : null}
            <FormError message={topError} />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={decide.isPending} onClick={onClose}>
                Close
              </Button>
              {managing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={decide.isPending}
                    onClick={() => act('canceled')}
                  >
                    {pendingStatus === 'canceled' ? 'Saving…' : 'Cancel trip'}
                  </Button>
                  <Button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => act('completed')}
                  >
                    {pendingStatus === 'completed' ? 'Saving…' : 'Mark completed'}
                  </Button>
                </>
              ) : null}
              {deciding ? (
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
                  <Button type="button" disabled={decide.isPending} onClick={() => act('approved')}>
                    {pendingStatus === 'approved' ? 'Saving…' : 'Approve'}
                  </Button>
                </>
              ) : null}
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
