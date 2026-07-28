import type { IntakeStatus } from '@jumpstart/shared';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { formatDate } from '@/lib/utils';
import {
  SLA_DAYS,
  ageDays,
  isReviewable,
  type DuplicateCandidate,
  type ReviewPayload,
} from './types';

/** Submitted date + age, amber once the 3-day review SLA has slipped (§6.11). */
export function SubmittedAge({
  submittedAt,
  status,
}: {
  submittedAt: string;
  status: IntakeStatus;
}) {
  const days = ageDays(submittedAt);
  const breached = isReviewable(status) && days > SLA_DAYS;
  return (
    <span className="whitespace-nowrap">
      {formatDate(submittedAt)}{' '}
      {breached ? (
        <Badge variant="warning">{days}d waiting</Badge>
      ) : (
        <span className="text-muted-foreground">· {days}d</span>
      )}
    </span>
  );
}

/** Label/value row used across the detail dialogs. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2">{children ?? '—'}</span>
    </div>
  );
}

/**
 * §6.11 link-instead-of-create: duplicate candidates found for the submission,
 * with a "use existing person" choice that feeds existingPersonId on approve.
 */
export function DuplicateCandidatePicker({
  candidates,
  value,
  onChange,
}: {
  candidates: DuplicateCandidate[];
  value: string | null;
  onChange: (personId: string | null) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-800">
        {candidates.length} possible existing {candidates.length === 1 ? 'match' : 'matches'} —
        link instead of creating a duplicate person.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="dup-choice"
          checked={value === null}
          onChange={() => onChange(null)}
        />
        Create a new person
      </label>
      {candidates.map((c) => (
        <label key={c.id} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="dup-choice"
            className="mt-1"
            checked={value === c.id}
            onChange={() => onChange(c.id)}
          />
          <span>
            <span className="font-medium">
              {c.firstName} {c.lastName}
            </span>
            {c.participantNumber ? (
              <span className="text-muted-foreground"> · {c.participantNumber}</span>
            ) : null}
            <span className="ml-1 inline-flex gap-1 align-middle">
              {c.profileTypes.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </span>
            <span className="block text-xs text-muted-foreground">
              {[
                c.dateOfBirth ? `DOB ${formatDate(c.dateOfBirth)}` : null,
                c.primaryPhone,
                c.primaryEmail,
                [c.city, c.state].filter(Boolean).join(', ') || null,
              ]
                .filter(Boolean)
                .join(' · ') || 'No contact details on file'}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Shared review controls: notes + Approve / Reject / Spam. Already-reviewed
 * submissions show their review stamp instead of actions.
 */
export function ReviewControls({
  status,
  reviewedAt,
  reviewNotes,
  canUpdate,
  pending,
  error,
  onAction,
  approveHint,
}: {
  status: IntakeStatus;
  reviewedAt: string | null;
  reviewNotes?: string | null;
  canUpdate: boolean;
  pending: boolean;
  error: string | null;
  onAction: (payload: Omit<ReviewPayload, 'existingPersonId'>) => void;
  approveHint?: string;
}) {
  const [notes, setNotes] = useState('');

  if (!isReviewable(status)) {
    return (
      <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-muted-foreground">
            Reviewed {formatDate(reviewedAt)}
          </span>
        </div>
        {reviewNotes ? <p className="text-muted-foreground">{reviewNotes}</p> : null}
      </div>
    );
  }

  if (!canUpdate) {
    return (
      <p className="text-sm text-muted-foreground">
        You can view this queue but need intake update access to review submissions.
      </p>
    );
  }

  const act = (action: ReviewPayload['action']) =>
    onAction({ action, reviewNotes: notes.trim() || undefined });

  return (
    <div className="space-y-3">
      {error ? <ErrorState error={new Error(error)} /> : null}
      {approveHint ? <p className="text-xs text-muted-foreground">{approveHint}</p> : null}
      <div className="space-y-1.5">
        <Label>Review notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="ghost" disabled={pending} onClick={() => act('spam')}>
          Spam
        </Button>
        <Button variant="destructive" disabled={pending} onClick={() => act('reject')}>
          Reject
        </Button>
        <Button disabled={pending} onClick={() => act('approve')}>
          {pending ? 'Saving…' : 'Approve'}
        </Button>
      </DialogFooter>
    </div>
  );
}
