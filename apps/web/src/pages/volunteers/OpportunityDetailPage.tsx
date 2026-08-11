import { volunteerShiftSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardHeaderRow, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader, SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
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
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { formatDate } from '@/lib/utils';
import { OpportunityFormDialog } from './OpportunityFormDialog';
import { RosterDialog } from './RosterDialog';
import { OpportunityStatusBadge, formatHours, formatTime } from './shared';
import type { OpportunityDetail, ShiftRow } from './types';

export function OpportunityDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
  const [deletingShift, setDeletingShift] = useState<ShiftRow | null>(null);
  const [rosterShiftId, setRosterShiftId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['volunteers', 'opportunity', id],
    queryFn: () => api.get<OpportunityDetail>(`/volunteers/opportunities/${id}`),
    enabled: Boolean(id),
  });

  const archive = useMutation({
    mutationFn: () => api.patch(`/volunteers/opportunities/${id}`, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setArchiveOpen(false);
    },
  });

  const removeShift = useMutation({
    mutationFn: (shiftId: string) => api.delete(`/volunteers/shifts/${shiftId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setDeletingShift(null);
    },
  });

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const today = todayInput();
  const byDateTime = (a: ShiftRow, b: ShiftRow) =>
    (a.shiftDate + a.startTime).localeCompare(b.shiftDate + b.startTime);
  const upcoming = data.shifts.filter((s) => s.shiftDate.slice(0, 10) >= today).sort(byDateTime);
  const past = data.shifts
    .filter((s) => s.shiftDate.slice(0, 10) < today)
    .sort((a, b) => byDateTime(b, a));
  // Keep the roster dialog fed with fresh data after each mutation.
  const rosterShift = data.shifts.find((s) => s.id === rosterShiftId) ?? null;

  return (
    <div className="space-y-4">
      <BackLink fallbackTo="/volunteers/opportunities" fallbackLabel="Opportunities" />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {data.name}
            <OpportunityStatusBadge status={data.status} />
          </span>
        }
        description={[data.location, data.state].filter(Boolean).join(' · ') || undefined}
        actions={
          can('volunteers.update') ? (
            <>
              {data.status !== 'archived' ? (
                <Button variant="outline" onClick={() => setArchiveOpen(true)}>
                  <Archive className="h-4 w-4" /> Archive
                </Button>
              ) : null}
              <Button onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <InfoItem label="Description" className="sm:col-span-2">
                {data.description ? (
                  <span className="whitespace-pre-wrap">{data.description}</span>
                ) : null}
              </InfoItem>
              <InfoItem label="Institution">{data.institution?.name}</InfoItem>
              <InfoItem label="Outside program">{data.outsideProgram?.name}</InfoItem>
              <InfoItem label="Event">
                {data.event
                  ? `${data.event.name}${data.event.eventDate ? ` · ${formatDate(data.event.eventDate)}` : ''}`
                  : null}
              </InfoItem>
              <InfoItem label="Chapter">{data.state}</InfoItem>
              <InfoItem label="Notes" className="sm:col-span-2">
                {data.notes ? <span className="whitespace-pre-wrap">{data.notes}</span> : null}
              </InfoItem>
            </DescriptionList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hours summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-center">
              <div>
                <p className="text-2xl font-semibold">
                  {formatHours(data.hoursSummary?.totalApproved)}
                </p>
                <p className="text-xs text-muted-foreground">Approved hours</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{data.hoursSummary?.approvedEntries ?? 0}</p>
                <p className="text-xs text-muted-foreground">Hours entries</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Checking a volunteer out of a shift records an approved hours entry automatically.
            </p>
          </CardContent>
        </Card>
      </div>

      <SectionHeader
        title="Shifts"
        actions={
          can('volunteers.create') ? (
            <Button
              onClick={() => {
                setEditingShift(null);
                setShiftDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New shift
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeaderRow title="Upcoming" description={`${upcoming.length} scheduled`} />
        <CardContent className="p-0 pb-2">
          <ShiftsTable
            rows={upcoming}
            emptyLabel="No upcoming shifts — add one to open signups."
            canUpdate={can('volunteers.update')}
            canDelete={can('volunteers.delete')}
            onRoster={(s) => setRosterShiftId(s.id)}
            onEdit={(s) => {
              setEditingShift(s);
              setShiftDialogOpen(true);
            }}
            onDelete={(s) => {
              removeShift.reset();
              setDeletingShift(s);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Past" description={`${past.length} completed`} />
        <CardContent className="p-0 pb-2">
          <ShiftsTable
            rows={past}
            emptyLabel="No past shifts yet."
            canUpdate={can('volunteers.update')}
            canDelete={can('volunteers.delete')}
            onRoster={(s) => setRosterShiftId(s.id)}
            onEdit={(s) => {
              setEditingShift(s);
              setShiftDialogOpen(true);
            }}
            onDelete={(s) => {
              removeShift.reset();
              setDeletingShift(s);
            }}
          />
        </CardContent>
      </Card>

      <OpportunityFormDialog opportunity={data} open={editOpen} onOpenChange={setEditOpen} />

      <ShiftDialog
        opportunityId={data.id}
        shift={editingShift}
        open={shiftDialogOpen}
        onOpenChange={(next) => {
          setShiftDialogOpen(next);
          if (!next) setEditingShift(null);
        }}
      />

      <RosterDialog
        shift={rosterShift}
        open={rosterShift !== null}
        onOpenChange={(next) => {
          if (!next) setRosterShiftId(null);
        }}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive opportunity?"
        description={`Archive "${data.name}"? It stays on record with its shifts and hours but closes for new signups.`}
        confirmLabel="Archive"
        destructive={false}
        isPending={archive.isPending}
        error={archive.error ? archive.error.message : null}
        onConfirm={() => archive.mutate()}
      />

      <ConfirmDialog
        open={deletingShift !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingShift(null);
        }}
        title="Delete shift?"
        description={
          deletingShift
            ? `Delete the ${formatDate(deletingShift.shiftDate)} shift? Signups remain on record for history.`
            : undefined
        }
        confirmLabel="Delete shift"
        isPending={removeShift.isPending}
        error={removeShift.error ? removeShift.error.message : null}
        onConfirm={() => {
          if (deletingShift) removeShift.mutate(deletingShift.id);
        }}
      />
    </div>
  );
}

// ── Shifts table (embedded in detail — not paged) ───────────────────────────

function ShiftsTable({
  rows,
  emptyLabel,
  canUpdate,
  canDelete,
  onRoster,
  onEdit,
  onDelete,
}: {
  rows: ShiftRow[];
  emptyLabel: string;
  canUpdate: boolean;
  canDelete: boolean;
  onRoster: (shift: ShiftRow) => void;
  onEdit: (shift: ShiftRow) => void;
  onDelete: (shift: ShiftRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="px-5 pb-3 text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Signed up</TableHead>
          <TableHead>Waitlist</TableHead>
          <TableHead className="text-right"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const full = row.capacity !== null && row.signedUpCount >= row.capacity;
          return (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap font-medium">
                {formatDate(row.shiftDate)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatTime(row.startTime)} – {formatTime(row.endTime)}
                {row.location ? (
                  <span className="block text-xs text-muted-foreground">{row.location}</span>
                ) : null}
              </TableCell>
              <TableCell>
                {row.role ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  {row.signedUpCount}
                  {row.capacity !== null ? (
                    <span className="text-muted-foreground">/ {row.capacity}</span>
                  ) : null}
                  {full ? <Badge variant="warning">Full</Badge> : null}
                </span>
              </TableCell>
              <TableCell>
                {row.waitlistCount > 0 ? (
                  <Badge variant="warning">{row.waitlistCount} waitlisted</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="outline" size="sm" onClick={() => onRoster(row)}>
                    <Users className="h-4 w-4" /> Roster
                  </Button>
                  {canUpdate ? (
                    <Button variant="ghost" size="sm" onClick={() => onEdit(row)}>
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => onDelete(row)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Shift create/edit dialog ────────────────────────────────────────────────

interface ShiftFormValues {
  shiftDate: string;
  startTime: string;
  endTime: string;
  capacity?: number | string;
  role?: string;
  location?: string;
  notes?: string;
}

const shiftResolver = formResolver<ShiftFormValues>(volunteerShiftSchema);

function ShiftDialog({
  opportunityId,
  shift,
  open,
  onOpenChange,
}: {
  opportunityId: string;
  shift: ShiftRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<ShiftFormValues>({
    resolver: shiftResolver,
    values: {
      shiftDate: shift ? shift.shiftDate.slice(0, 10) : todayInput(),
      startTime: shift?.startTime ?? '09:00',
      endTime: shift?.endTime ?? '12:00',
      capacity: shift?.capacity ?? '',
      role: shift?.role ?? '',
      location: shift?.location ?? '',
      notes: shift?.notes ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      shift
        ? api.patch(`/volunteers/shifts/${shift.id}`, payload)
        : api.post(`/volunteers/opportunities/${opportunityId}/shifts`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setTopError(null);
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  const onSubmit = form.handleSubmit((data) => {
    setTopError(null);
    // Blank inputs mean "no value" — send explicit nulls so edits can clear.
    save.mutate({
      ...data,
      capacity: data.capacity ?? null,
      role: data.role ?? null,
      location: data.location ?? null,
      notes: data.notes ?? null,
    });
  });

  const { register, formState } = form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent unsavedChanges={form.formState.isDirty} size="lg">
        <DialogHeader>
          <DialogTitle>{shift ? 'Edit shift' : 'New shift'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date" required error={formState.errors.shiftDate}>
              <Input type="date" {...register('shiftDate')} />
            </FormField>
            <FormField
              label="Capacity"
              error={formState.errors.capacity}
              hint="Blank = unlimited; extra signups join the waitlist"
            >
              <Input type="number" min={1} step={1} {...register('capacity')} />
            </FormField>
            <FormField label="Start time" required error={formState.errors.startTime}>
              <Input type="time" {...register('startTime')} />
            </FormField>
            <FormField label="End time" required error={formState.errors.endTime}>
              <Input type="time" {...register('endTime')} />
            </FormField>
            <FormField label="Role" error={formState.errors.role}>
              <Input {...register('role')} placeholder="e.g. Greeter, Setup crew" />
            </FormField>
            <FormField label="Location" error={formState.errors.location}>
              <Input {...register('location')} placeholder="Overrides the opportunity location" />
            </FormField>
            <FormField label="Notes" error={formState.errors.notes} className="sm:col-span-2">
              <Textarea rows={2} {...register('notes')} />
            </FormField>
          </div>

          <FormError message={topError} />

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : shift ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
