import { zodResolver } from '@hookform/resolvers/zod';
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  volunteerAssignmentSchema,
  type AssignmentStatus,
  type AssignmentType,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
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
import { EmptyState } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { useInsideClassesLookup, useInstitutionsLookup, useOutsideProgramsLookup, useEventsLookup } from '../lookups';
import { applyApiFormErrors, ErrorNotice, WarningNotice } from '../shared';
import type { AssignmentRow, EligibilityResult, VolunteerDetail } from '../types';

function assignmentPlace(row: AssignmentRow) {
  const parts = [
    row.institution?.name,
    row.insideClass?.name,
    row.outsideProgram?.name,
    row.event?.name,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : '—';
}

export function AssignmentsTab({ volunteer }: { volunteer: VolunteerDetail }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const endAssignment = useMutation({
    mutationFn: (assignmentId: string) =>
      api.patch(`/volunteers/assignments/${assignmentId}`, {
        status: 'ended',
        endDate: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['volunteers'] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {volunteer.assignments.length} assignment{volunteer.assignments.length === 1 ? '' : 's'}
        </p>
        {can('volunteers.create') ? (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> New assignment
          </Button>
        ) : null}
      </div>

      {volunteer.assignments.length === 0 ? (
        <EmptyState title="No assignments yet" hint="Assignments track where this volunteer serves." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Where</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {volunteer.assignments.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{humanize(row.assignmentType)}</TableCell>
                <TableCell>{assignmentPlace(row)}</TableCell>
                <TableCell>{row.role ?? '—'}</TableCell>
                <TableCell>{formatDate(row.startDate)}</TableCell>
                <TableCell>{formatDate(row.endDate)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={row.status} />
                    {row.clearanceOverride ? (
                      <Badge variant="warning" title={row.clearanceOverrideReason ?? undefined}>
                        Override
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {can('volunteers.update') &&
                  (row.status === 'active' || row.status === 'proposed') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={endAssignment.isPending}
                      onClick={() => endAssignment.mutate(row.id)}
                    >
                      End
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NewAssignmentDialog
        volunteer={volunteer}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

// ── New assignment: eligibility pre-check + §6.6 conflict handling ──────────

interface AssignmentFormValues {
  volunteerProfileId: string;
  assignmentType: AssignmentType;
  institutionId?: string;
  insideClassId?: string;
  outsideProgramId?: string;
  eventId?: string;
  role?: string;
  startDate: string;
  endDate?: string;
  status: AssignmentStatus;
  notes?: string;
  clearanceOverride: boolean;
  clearanceOverrideReason?: string;
}

const assignmentResolver =
  zodResolver(volunteerAssignmentSchema) as unknown as Resolver<AssignmentFormValues>;

const optionalUuid = { setValueAs: (v: string) => (v === '' ? undefined : v) };

const OUTSIDE_PROGRAM_TYPES: AssignmentType[] = ['outside_class', 'bible_study', 'mentoring', 'other'];

function NewAssignmentDialog({
  volunteer,
  open,
  onOpenChange,
}: {
  volunteer: VolunteerDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [softConflict, setSoftConflict] = useState<string | null>(null);
  const [hardConflict, setHardConflict] = useState<string | null>(null);

  const form = useForm<AssignmentFormValues>({
    resolver: assignmentResolver,
    defaultValues: {
      volunteerProfileId: volunteer.id,
      assignmentType: 'inside_class',
      startDate: new Date().toISOString().slice(0, 10),
      status: 'active',
      clearanceOverride: false,
    },
  });
  const { register, watch, formState } = form;

  const type = watch('assignmentType');
  const institutionId = watch('institutionId');
  const insideClassId = watch('insideClassId');
  const override = watch('clearanceOverride');

  const institutions = useInstitutionsLookup();
  const insideClasses = useInsideClassesLookup(institutionId || undefined);
  const outsidePrograms = useOutsideProgramsLookup();
  const events = useEventsLookup();

  // The facility can come from the class when only the class is chosen.
  const classInstitutionId = insideClasses.items.find((c) => c.id === insideClassId)?.institutionId;
  const effectiveInstitutionId = institutionId || classInstitutionId || undefined;

  // Proactive §6.6 pre-check so staff see missing clearances before the 409.
  const { data: eligibility } = useQuery({
    queryKey: ['volunteers', 'eligibility', volunteer.id, effectiveInstitutionId],
    queryFn: () =>
      api.get<EligibilityResult>(
        `/volunteers/${volunteer.id}/eligibility${qs({ institutionId: effectiveInstitutionId })}`,
      ),
    enabled: open && Boolean(effectiveInstitutionId),
  });

  const missing = eligibility?.missing ?? [];
  const hardMissing = missing.filter((m) => m.requirement.hardBlock);
  const softMissing = missing.filter((m) => !m.requirement.hardBlock);

  const close = (next: boolean) => {
    if (!next) {
      form.reset();
      setTopError(null);
      setSoftConflict(null);
      setHardConflict(null);
    }
    onOpenChange(next);
  };

  const create = useMutation({
    mutationFn: (payload: AssignmentFormValues) => api.post('/volunteers/assignments', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      close(false);
    },
    onError: (err) => {
      // §6.6: hard-block conflicts can never be overridden; soft-block
      // conflicts surface the override checkbox + reason.
      if (err instanceof ApiError && err.status === 409) {
        if (err.message.includes('hard-block')) {
          setHardConflict(err.message);
          setSoftConflict(null);
        } else {
          setSoftConflict(err.message);
          setHardConflict(null);
        }
        return;
      }
      setTopError(applyApiFormErrors(err, form.setError));
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    setTopError(null);
    setSoftConflict(null);
    setHardConflict(null);
    create.mutate(data);
  });

  const showOverrideControls = softMissing.length > 0 || softConflict !== null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New assignment</DialogTitle>
          <DialogDescription>
            Facility-bound assignments are validated against that institution&apos;s clearance
            requirements.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Assignment type" required error={formState.errors.assignmentType}>
              <Select {...register('assignmentType')}>
                {ASSIGNMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status" error={formState.errors.status}>
              <Select {...register('status')}>
                {ASSIGNMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Institution"
              required={type === 'inside_class' && !insideClassId}
              error={formState.errors.institutionId}
              hint={!institutions.allowed ? 'No permission to list institutions' : undefined}
            >
              <Select {...register('institutionId', optionalUuid)}>
                <option value="">—</option>
                {institutions.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
            </FormField>
            {type === 'inside_class' ? (
              <FormField
                label="Inside class"
                error={formState.errors.insideClassId}
                hint={!insideClasses.allowed ? 'No permission to list classes' : undefined}
              >
                <Select {...register('insideClassId', optionalUuid)}>
                  <option value="">—</option>
                  {insideClasses.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
            {OUTSIDE_PROGRAM_TYPES.includes(type) ? (
              <FormField
                label="Outside program"
                error={formState.errors.outsideProgramId}
                hint={!outsidePrograms.allowed ? 'No permission to list programs' : undefined}
              >
                <Select {...register('outsideProgramId', optionalUuid)}>
                  <option value="">—</option>
                  {outsidePrograms.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
            {type === 'event' ? (
              <FormField
                label="Event"
                error={formState.errors.eventId}
                hint={!events.allowed ? 'No permission to list events' : undefined}
              >
                <Select {...register('eventId', optionalUuid)}>
                  <option value="">—</option>
                  {events.items.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.eventDate ? ` (${formatDate(e.eventDate)})` : ''}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
            <FormField label="Role" error={formState.errors.role}>
              <Input {...register('role')} placeholder="e.g. Teacher, Driver" />
            </FormField>
            <FormField label="Start date" required error={formState.errors.startDate}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" error={formState.errors.endDate}>
              <Input type="date" {...register('endDate')} />
            </FormField>
            <FormField label="Notes" error={formState.errors.notes} className="col-span-2">
              <Textarea rows={2} {...register('notes')} />
            </FormField>
          </div>

          {effectiveInstitutionId && missing.length > 0 ? (
            <div className="space-y-2">
              {hardMissing.length > 0 ? (
                <ErrorNotice>
                  <p className="font-medium">
                    Missing hard-block requirements — this assignment will be rejected:
                  </p>
                  <ul className="mt-1 list-inside list-disc">
                    {hardMissing.map((m) => (
                      <li key={m.requirement.id}>
                        {m.requirement.name} ({humanize(m.status)})
                      </li>
                    ))}
                  </ul>
                </ErrorNotice>
              ) : null}
              {softMissing.length > 0 ? (
                <WarningNotice>
                  <p className="font-medium">Missing clearances (override allowed with reason):</p>
                  <ul className="mt-1 list-inside list-disc">
                    {softMissing.map((m) => (
                      <li key={m.requirement.id}>
                        {m.requirement.name} ({humanize(m.status)})
                      </li>
                    ))}
                  </ul>
                </WarningNotice>
              ) : null}
            </div>
          ) : null}

          {hardConflict ? <ErrorNotice>{hardConflict}</ErrorNotice> : null}
          {softConflict ? <WarningNotice>{softConflict}</WarningNotice> : null}

          {showOverrideControls ? (
            <div className="space-y-2 rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <Checkbox id="clearance-override" {...register('clearanceOverride')} />
                <Label htmlFor="clearance-override">
                  Override missing clearances (soft-block, recorded in the audit log)
                </Label>
              </div>
              {override ? (
                <FormField
                  label="Override reason"
                  required
                  error={formState.errors.clearanceOverrideReason}
                >
                  <Input
                    {...register('clearanceOverrideReason')}
                    placeholder="Why this assignment may proceed"
                  />
                </FormField>
              ) : null}
            </div>
          ) : null}

          {topError ? <ErrorNotice>{topError}</ErrorNotice> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create assignment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
