import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, fullName } from '@/lib/utils';
import type { AttendanceStatus, ClassSession, RosterEnrollment } from './types';

const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'excused'];

interface AttendanceRowState {
  status: AttendanceStatus | '';
  notes: string;
}

function AddSessionDialog({
  open,
  onOpenChange,
  classId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
}) {
  const queryClient = useQueryClient();
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSessionDate(new Date().toISOString().slice(0, 10));
      setTopic('');
      setNotes('');
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<ClassSession>(`/inside-classes/${classId}/sessions`, {
        sessionDate,
        topic: topic || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inside-classes', classId, 'sessions'] });
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not add session'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add session</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Session date" required>
            <Input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </FormField>
          <FormField label="Topic">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </FormField>
          <FormField label="Notes">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!sessionDate || mutation.isPending}>
              {mutation.isPending ? 'Adding…' : 'Add session'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceGrid({
  session,
  roster,
  canUpdate,
  classId,
}: {
  session: ClassSession;
  roster: RosterEnrollment[];
  canUpdate: boolean;
  classId: string;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, AttendanceRowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed the grid whenever the selected session (or its saved attendance) changes.
  useEffect(() => {
    const byEnrollment = new Map(session.attendance.map((a) => [a.enrollmentId, a]));
    const next: Record<string, AttendanceRowState> = {};
    for (const enrollment of roster) {
      const existing = byEnrollment.get(enrollment.id);
      next[enrollment.id] = {
        status: existing?.status ?? '',
        notes: existing?.notes ?? '',
      };
    }
    setRows(next);
    setError(null);
    setSaved(false);
  }, [session, roster]);

  const setRow = (enrollmentId: string, patch: Partial<AttendanceRowState>) => {
    setRows((prev) => ({ ...prev, [enrollmentId]: { ...prev[enrollmentId], ...patch } }));
    setSaved(false);
  };

  const markedCount = Object.values(rows).filter((r) => r.status !== '').length;

  const mutation = useMutation({
    mutationFn: () =>
      api.put(`/inside-classes/sessions/${session.id}/attendance`, {
        rows: Object.entries(rows)
          .filter(([, row]) => row.status !== '')
          .map(([enrollmentId, row]) => ({
            enrollmentId,
            status: row.status,
            notes: row.notes || undefined,
          })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inside-classes', classId, 'sessions'] });
      setSaved(true);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not save attendance'),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {formatDate(session.sessionDate)}
          {session.topic ? <span className="text-muted-foreground"> — {session.topic}</span> : null}
        </p>
        {canUpdate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((prev) =>
                Object.fromEntries(
                  Object.entries(prev).map(([id, row]) => [
                    id,
                    { ...row, status: 'present' as const },
                  ]),
                ),
              )
            }
          >
            Mark all present
          </Button>
        ) : null}
      </div>

      {roster.length === 0 ? (
        <EmptyState title="No one is on the roster yet" hint="Enroll participants first" />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead className="w-36">Attendance</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((enrollment) => {
                const row = rows[enrollment.id] ?? { status: '' as const, notes: '' };
                return (
                  <TableRow key={enrollment.id}>
                    <TableCell className="font-medium">
                      {fullName(enrollment.participantProfile.person)}
                    </TableCell>
                    <TableCell>
                      <Select
                        className={cn('h-8', row.status === '' && 'text-muted-foreground')}
                        value={row.status}
                        disabled={!canUpdate}
                        onChange={(e) =>
                          setRow(enrollment.id, {
                            status: e.target.value as AttendanceStatus | '',
                          })
                        }
                      >
                        <option value="">Not marked</option>
                        {ATTENDANCE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={row.notes}
                        disabled={!canUpdate}
                        onChange={(e) => setRow(enrollment.id, { notes: e.target.value })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {canUpdate ? (
        <div className="flex items-center justify-end gap-3">
          {saved ? <span className="text-sm text-muted-foreground">Attendance saved</span> : null}
          <Button onClick={() => mutation.mutate()} disabled={markedCount === 0 || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : `Save attendance (${markedCount})`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SessionsTab({
  classId,
  roster,
}: {
  classId: string;
  roster: RosterEnrollment[];
}) {
  const { can } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ['inside-classes', classId, 'sessions'],
    queryFn: () => api.get<ClassSession[]>(`/inside-classes/${classId}/sessions`),
  });

  if (sessionsQuery.isLoading) return <PageLoader />;
  if (sessionsQuery.isError) return <ErrorState error={sessionsQuery.error} />;

  const sessions = sessionsQuery.data ?? [];
  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[sessions.length - 1] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
        </p>
        {can('inside_classes.create') ? (
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add session
          </Button>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <EmptyState title="No sessions recorded" hint="Add a session to start taking attendance" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px,1fr]">
          <div className="space-y-1">
            {sessions.map((session) => {
              const presentCount = session.attendance.filter((a) => a.status === 'present').length;
              const isSelected = selected?.id === session.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedId(session.id)}
                  className={cn(
                    'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    isSelected ? 'border-primary bg-accent' : 'hover:bg-accent',
                  )}
                >
                  <span className="font-medium">{formatDate(session.sessionDate)}</span>
                  {session.topic ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {session.topic}
                    </span>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    {session.attendance.length > 0
                      ? `${presentCount}/${roster.length} present`
                      : 'Attendance not taken'}
                  </span>
                </button>
              );
            })}
          </div>

          {selected ? (
            <AttendanceGrid
              session={selected}
              roster={roster}
              canUpdate={can('inside_classes.update')}
              classId={classId}
            />
          ) : (
            <EmptyState title="Select a session" />
          )}
        </div>
      )}

      <AddSessionDialog open={addOpen} onOpenChange={setAddOpen} classId={classId} />
    </div>
  );
}
