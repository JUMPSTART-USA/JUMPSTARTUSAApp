import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
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
import { formatDate, fullName, humanize } from '@/lib/utils';
import { SessionFormDialog } from './SessionFormDialog';
import { FormErrorNotice, InfoItem } from './shared';
import type {
  AttendanceStatus,
  OutsideProgramDetail,
  OutsideSessionDetail,
} from './types';
import { ATTENDANCE_STATUSES } from './types';

interface RowState {
  status: '' | AttendanceStatus;
  notes: string;
}

export function OutsideSessionDetailPage() {
  const { sessionId = '' } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canUpdate = can('outside_programs.update');

  const [editOpen, setEditOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [saved, setSaved] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ['outside-programs', 'session', sessionId],
    queryFn: () => api.get<OutsideSessionDetail>(`/outside-programs/sessions/${sessionId}`),
  });
  const session = sessionQuery.data;

  // Attendance rows must reference this program's enrollments — the roster
  // comes from the program detail, prefilled from any existing attendance.
  const programQuery = useQuery({
    queryKey: ['outside-programs', 'detail', session?.outsideProgram.id],
    queryFn: () =>
      api.get<OutsideProgramDetail>(`/outside-programs/${session!.outsideProgram.id}`),
    enabled: !!session,
  });

  useEffect(() => {
    if (session) {
      const next: Record<string, RowState> = {};
      for (const a of session.attendance) {
        next[a.enrollmentId] = { status: a.status, notes: a.notes ?? '' };
      }
      setRows(next);
    }
  }, [session]);

  const saveMutation = useMutation({
    mutationFn: (payload: Array<{ enrollmentId: string; status: AttendanceStatus; notes?: string }>) =>
      api.post(`/outside-programs/sessions/${sessionId}/attendance`, { rows: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outside-programs'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (sessionQuery.isLoading) return <PageLoader />;
  if (sessionQuery.error) return <ErrorState error={sessionQuery.error} />;
  if (!session) return <ErrorState error={new Error('Session not found')} />;

  const roster = programQuery.data?.enrollments ?? [];
  const markedCount = roster.filter((e) => rows[e.id]?.status).length;

  const setRow = (enrollmentId: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [enrollmentId]: { status: '', notes: '', ...prev[enrollmentId], ...patch },
    }));
  };

  const markAllPresent = () => {
    setRows((prev) => {
      const next = { ...prev };
      for (const e of roster) {
        next[e.id] = { status: 'present', notes: next[e.id]?.notes ?? '' };
      }
      return next;
    });
  };

  const save = () => {
    const payload = roster.flatMap((e) => {
      const row = rows[e.id];
      if (!row?.status) return [];
      return [
        {
          enrollmentId: e.id,
          status: row.status,
          notes: row.notes.trim() || undefined,
        },
      ];
    });
    if (payload.length) saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to={`/outside-programs/${session.outsideProgram.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {session.outsideProgram.name}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Session — {formatDate(session.sessionDate)}
          </h1>
        </div>
        {canUpdate ? (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit Session
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
            <InfoItem label="Date">{formatDate(session.sessionDate)}</InfoItem>
            <InfoItem label="Topic">{session.topic ?? '—'}</InfoItem>
            <InfoItem label="Notes">{session.notes ?? '—'}</InfoItem>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Attendance</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {markedCount} of {roster.length} marked
            </p>
          </div>
          {canUpdate ? (
            <div className="flex items-center gap-2">
              {saved ? (
                <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                  <Check className="h-4 w-4" /> Saved
                </span>
              ) : null}
              <Button variant="outline" size="sm" onClick={markAllPresent}>
                Mark all present
              </Button>
              <Button size="sm" onClick={save} disabled={markedCount === 0 || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save Attendance'}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {saveMutation.error ? (
            <div className="mb-3">
              <FormErrorNotice
                message={
                  saveMutation.error instanceof Error
                    ? saveMutation.error.message
                    : 'Save failed'
                }
              />
            </div>
          ) : null}
          {programQuery.isLoading ? (
            <PageLoader />
          ) : roster.length === 0 ? (
            <EmptyState
              title="No roster"
              hint="Enroll participants in the program before recording attendance"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participant</TableHead>
                  <TableHead>Enrollment</TableHead>
                  <TableHead className="w-40">Attendance</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-medium">{fullName(e.participantProfile.person)}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.participantProfile.participantNumber}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={rows[e.id]?.status ?? ''}
                        onChange={(ev) =>
                          setRow(e.id, { status: ev.target.value as '' | AttendanceStatus })
                        }
                        disabled={!canUpdate}
                      >
                        <option value="">Not marked</option>
                        {ATTENDANCE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {humanize(s)}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={rows[e.id]?.notes ?? ''}
                        onChange={(ev) => setRow(e.id, { notes: ev.target.value })}
                        disabled={!canUpdate}
                        placeholder="—"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SessionFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        programId={session.outsideProgram.id}
        session={session}
      />
    </div>
  );
}
