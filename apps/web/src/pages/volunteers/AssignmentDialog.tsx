import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ASSIGNMENT_STATUSES, ASSIGNMENT_TYPES } from '@jumpstart/shared';
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
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { fullName, humanize } from '@/lib/utils';

/**
 * Assign/edit/remove a volunteer for a context record — an institution or an
 * inside class. Multiple volunteers per context are just multiple assignment
 * rows. Used from InstitutionProfilePage and InsideClassDetailPage.
 */
export interface AssignmentContext {
  institutionId?: string;
  insideClassId?: string;
  /** Query keys to invalidate after any mutation. */
  invalidate: readonly (readonly unknown[])[];
}

export interface AssignmentRowLite {
  id: string;
  assignmentType?: string | null;
  role: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  volunteerProfile: { id: string; person: { firstName: string; lastName: string } };
}

interface VolunteerHit {
  id: string;
  person: { firstName: string; lastName: string; preferredName?: string | null };
}

function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export function AssignmentDialog({
  context,
  state,
  onClose,
}: {
  context: AssignmentContext;
  /** 'new' = create; a row = edit; null = closed. */
  state: AssignmentRowLite | 'new' | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const creating = state === 'new';
  const existing = state !== 'new' ? state : null;

  const [volunteerId, setVolunteerId] = useState('');
  const [search, setSearch] = useState('');
  const [assignmentType, setAssignmentType] = useState<string>(
    context.insideClassId ? 'inside_class' : 'other',
  );
  const [role, setRole] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');
  const [clearanceOverride, setClearanceOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (state) {
      setError(null);
      setConfirmDelete(false);
      setSearch('');
      setVolunteerId(existing?.volunteerProfile.id ?? '');
      setAssignmentType(
        existing?.assignmentType ?? (context.insideClassId ? 'inside_class' : 'other'),
      );
      setRole(existing?.role ?? '');
      setStartDate(existing ? toDateInput(existing.startDate) : new Date().toISOString().slice(0, 10));
      setEndDate(toDateInput(existing?.endDate));
      setStatus(existing?.status ?? 'active');
      setNotes('');
      setClearanceOverride(false);
      setOverrideReason('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const volunteersQuery = useQuery({
    queryKey: ['volunteers', 'picker', search],
    queryFn: () =>
      api.get<Paged<VolunteerHit>>(`/volunteers${qs({ search, pageSize: 20, status: 'active' })}`),
    enabled: creating,
  });

  const invalidateAll = () => {
    for (const key of context.invalidate) {
      queryClient.invalidateQueries({ queryKey: [...key] });
    }
  };

  const save = useMutation({
    mutationFn: () =>
      creating
        ? api.post('/volunteers/assignments', {
            volunteerProfileId: volunteerId,
            assignmentType,
            institutionId: context.institutionId,
            insideClassId: context.insideClassId,
            role: role || undefined,
            startDate,
            endDate: endDate || undefined,
            status,
            notes: notes || undefined,
            clearanceOverride,
            clearanceOverrideReason: clearanceOverride ? overrideReason || undefined : undefined,
          })
        : api.patch(`/volunteers/assignments/${existing?.id}`, {
            assignmentType,
            role: role || undefined,
            startDate,
            endDate: endDate || undefined,
            status,
          }),
    onSuccess: () => {
      invalidateAll();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Save failed'),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/volunteers/assignments/${existing?.id}`),
    onSuccess: () => {
      invalidateAll();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Delete failed'),
  });

  const selectedVolunteer =
    creating && volunteerId
      ? volunteersQuery.data?.items.find((v) => v.id === volunteerId)
      : null;

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{creating ? 'Assign volunteer' : 'Edit assignment'}</DialogTitle>
          <DialogDescription>
            {creating
              ? 'Assign a volunteer here — assign as many volunteers as needed.'
              : `${existing?.volunteerProfile.person.firstName} ${existing?.volunteerProfile.person.lastName}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {creating ? (
            <FormField label="Volunteer" required>
              <div className="space-y-2">
                <Input
                  placeholder="Search volunteers by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Select value={volunteerId} onChange={(e) => setVolunteerId(e.target.value)}>
                  <option value="">
                    {volunteersQuery.isLoading ? 'Loading…' : 'Select a volunteer'}
                  </option>
                  {(volunteersQuery.data?.items ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {fullName(v.person)}
                    </option>
                  ))}
                </Select>
                {selectedVolunteer ? null : null}
              </div>
            </FormField>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Assignment type" required>
              <Select value={assignmentType} onChange={(e) => setAssignmentType(e.target.value)}>
                {ASSIGNMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Role">
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Teacher" />
            </FormField>
            <FormField label="Start date" required>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
            <FormField label="End date">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Status" required>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {ASSIGNMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </FormField>
          {creating ? (
            <FormField label="Notes">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
          ) : null}
          {creating ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Checkbox
                  checked={clearanceOverride}
                  onChange={(e) => setClearanceOverride(e.target.checked)}
                />
                Override missing clearances (soft-block, §6.6)
              </Label>
              {clearanceOverride ? (
                <FormField label="Override reason" required>
                  <Input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Why is this assignment proceeding without full clearances?"
                  />
                </FormField>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="sm:justify-between">
            {!creating ? (
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
              >
                {remove.isPending
                  ? 'Removing…'
                  : confirmDelete
                    ? 'Click again to confirm'
                    : 'Remove'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={save.isPending || (creating && !volunteerId) || !startDate}
                onClick={() => save.mutate()}
              >
                {save.isPending ? 'Saving…' : creating ? 'Assign volunteer' : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
