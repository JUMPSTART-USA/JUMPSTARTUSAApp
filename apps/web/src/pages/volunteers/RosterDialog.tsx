import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { VolunteerPicker, type PickerOption } from '@/components/pickers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError, Notice } from '@/components/ui/notice';
import { EmptyState } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form';
import { formatDate, fullName } from '@/lib/utils';
import { SignupStatusBadge, formatTime } from './shared';
import type { ShiftRow, SignupMutationResult } from './types';
import type { ShiftSignupStatus } from '@jumpstart/shared';

function timeStamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

interface RosterNotice {
  variant: 'success' | 'info' | 'warning';
  message: string;
}

/**
 * Per-shift roster management: add signups (auto-waitlists at capacity),
 * confirm / cancel (auto-promotes the oldest waitlisted signup) / no-show,
 * check-in and check-out (check-out creates the approved hours entry).
 */
export function RosterDialog({
  shift,
  open,
  onOpenChange,
}: {
  shift: ShiftRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const [notice, setNotice] = useState<RosterNotice | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canManage = can('volunteers.update');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['volunteers'] });
  };

  const close = (next: boolean) => {
    if (!next) {
      setPicked(null);
      setNotice(null);
      setActionError(null);
    }
    onOpenChange(next);
  };

  const addSignup = useMutation({
    mutationFn: (volunteerProfileId: string) =>
      api.post<SignupMutationResult>(`/volunteers/shifts/${shift?.id}/signups`, {
        volunteerProfileId,
      }),
    onSuccess: (created) => {
      invalidate();
      setActionError(null);
      setNotice(
        created.status === 'waitlisted'
          ? {
              variant: 'warning',
              message: 'Shift is at capacity — the volunteer was added to the waitlist.',
            }
          : { variant: 'success', message: 'Volunteer signed up.' },
      );
      setPicked(null);
    },
    onError: (err) => setActionError(applyApiError(err)),
  });

  const updateSignup = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ShiftSignupStatus }) =>
      api.patch<SignupMutationResult>(`/volunteers/signups/${id}`, { status }),
    onSuccess: (updated, vars) => {
      invalidate();
      setActionError(null);
      if (vars.status === 'canceled') {
        setNotice(
          updated.promoted
            ? {
                variant: 'success',
                message: `Signup canceled — ${fullName(updated.promoted.volunteerProfile.person)} was promoted from the waitlist.`,
              }
            : { variant: 'info', message: 'Signup canceled.' },
        );
      } else {
        setNotice(null);
      }
    },
    onError: (err) => setActionError(applyApiError(err)),
  });

  const checkIn = useMutation({
    mutationFn: (id: string) => api.post<SignupMutationResult>(`/volunteers/signups/${id}/check-in`),
    onSuccess: () => {
      invalidate();
      setActionError(null);
      setNotice(null);
    },
    onError: (err) => setActionError(applyApiError(err)),
  });

  const checkOut = useMutation({
    mutationFn: (id: string) =>
      api.post<SignupMutationResult>(`/volunteers/signups/${id}/check-out`),
    onSuccess: () => {
      invalidate();
      setActionError(null);
      setNotice({
        variant: 'success',
        message: 'Checked out — an approved hours entry was created for this shift.',
      });
    },
    onError: (err) => setActionError(applyApiError(err)),
  });

  const busy =
    addSignup.isPending || updateSignup.isPending || checkIn.isPending || checkOut.isPending;

  if (!shift) return null;

  const active = shift.signups.filter((s) => s.status !== 'canceled');
  const canceled = shift.signups.filter((s) => s.status === 'canceled');

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>Shift roster</DialogTitle>
          <DialogDescription>
            {formatDate(shift.shiftDate)} · {formatTime(shift.startTime)} –{' '}
            {formatTime(shift.endTime)}
            {shift.role ? ` · ${shift.role}` : ''}
            {shift.capacity
              ? ` · ${shift.signedUpCount} of ${shift.capacity} seats filled`
              : ` · ${shift.signedUpCount} signed up`}
            {shift.waitlistCount > 0 ? ` · ${shift.waitlistCount} waitlisted` : ''}
          </DialogDescription>
        </DialogHeader>

        {notice ? <Notice variant={notice.variant}>{notice.message}</Notice> : null}
        <FormError message={actionError} />

        {canManage ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1">
              <VolunteerPicker value={picked} onChange={setPicked} disabled={busy} />
            </div>
            <Button
              disabled={!picked || busy}
              onClick={() => picked && addSignup.mutate(picked.id)}
            >
              <UserPlus className="h-4 w-4" />
              {addSignup.isPending ? 'Adding…' : 'Add to shift'}
            </Button>
          </div>
        ) : null}

        {shift.signups.length === 0 ? (
          <EmptyState title="No signups yet" hint="Add volunteers to this shift above." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Volunteer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...active, ...canceled].map((signup) => (
                <TableRow key={signup.id}>
                  <TableCell>
                    <Link
                      to={`/volunteers/${signup.volunteerProfile.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {fullName(signup.volunteerProfile.person)}
                    </Link>
                    {signup.notes ? (
                      <span className="block text-xs text-muted-foreground">{signup.notes}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <SignupStatusBadge status={signup.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {timeStamp(signup.checkedInAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {timeStamp(signup.checkedOutAt)}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <SignupActions
                        status={signup.status}
                        checkedIn={Boolean(signup.checkedInAt)}
                        checkedOut={Boolean(signup.checkedOutAt)}
                        busy={busy}
                        onConfirm={() => updateSignup.mutate({ id: signup.id, status: 'confirmed' })}
                        onCancel={() => updateSignup.mutate({ id: signup.id, status: 'canceled' })}
                        onNoShow={() => updateSignup.mutate({ id: signup.id, status: 'no_show' })}
                        onCheckIn={() => checkIn.mutate(signup.id)}
                        onCheckOut={() => checkOut.mutate(signup.id)}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {shift.capacity && shift.signedUpCount >= shift.capacity ? (
          <p className="text-xs text-muted-foreground">
            <Badge variant="warning">Full</Badge> New signups join the waitlist; canceling a seat
            promotes the oldest waitlisted volunteer automatically.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SignupActions({
  status,
  checkedIn,
  checkedOut,
  busy,
  onConfirm,
  onCancel,
  onNoShow,
  onCheckIn,
  onCheckOut,
}: {
  status: ShiftSignupStatus;
  checkedIn: boolean;
  checkedOut: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onNoShow: () => void;
  onCheckIn: () => void;
  onCheckOut: () => void;
}) {
  if (status === 'canceled' || status === 'no_show') {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {status === 'signed_up' || status === 'waitlisted' ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={onConfirm}>
          Confirm
        </Button>
      ) : null}
      {(status === 'signed_up' || status === 'confirmed') && !checkedIn ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={onCheckIn}>
          Check in
        </Button>
      ) : null}
      {status === 'attended' && checkedIn && !checkedOut ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={onCheckOut}>
          Check out
        </Button>
      ) : null}
      {status === 'signed_up' || status === 'confirmed' ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={onNoShow}>
          No-show
        </Button>
      ) : null}
      {status !== 'attended' ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
