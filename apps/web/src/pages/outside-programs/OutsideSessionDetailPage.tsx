import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardHeaderRow, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
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
import type { OutsideProgramDetail, OutsideSessionDetail } from './types';
import { BackLink } from '@/components/BackLink';

interface RowState {
  status: '' | AttendanceStatus;
  notes: string;
}

export function OutsideSessionDetailPage() {
  const { sessionId = '' } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canUpdate = can('outside_programs.update');

  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const removeSession = useMutation({
    mutationFn: () => api.delete(`/outside-programs/sessions/${sessionId}`),
    onSuccess: () => {
      const programId = sessionQuery.data?.outsideProgram.id;
      queryClient.invalidateQueries({ queryKey: ['outside-programs'] });
      navigate(programId ? `/outside-programs/${programId}` : '/outside-programs');
    },
  });

  if (sessionQuery.isLoading) return <PageLoader />;
  if (sessionQuery.error) return <ErrorState error={sessionQuery.error} onRetry={sessionQuery.refetch} />;
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
      <div className="space-y-1">
        <BackLink
          fallbackTo={`/outside-programs/${session.outsideProgram.id}`}
          fallbackLabel={session.outsideProgram.name}
        />
        <PageHeader
          title={`Session — ${formatDate(session.sessionDate)}`}
          actions={
            <>
              {canUpdate ? (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit session
                </Button>
              ) : null}
              {can('outside_programs.delete') ? (
                <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                  Delete session
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session details</CardTitle>
        </CardHeader>
        <CardContent>
          <DescriptionList columns={3}>
            <InfoItem label="Date">{formatDate(session.sessionDate)}</InfoItem>
            <InfoItem label="Topic">{session.topic ?? '—'}</InfoItem>
            <InfoItem label="Notes">{session.notes ?? '—'}</InfoItem>
          </DescriptionList>
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Attendance" description={`${markedCount} of ${roster.length} marked`}>
          {canUpdate ? (
            <>
              {saved ? (
                <span className="inline-flex items-center gap-1 text-sm text-success">
                  <Check className="h-4 w-4" /> Saved
                </span>
              ) : null}
              <Button variant="outline" size="sm" onClick={markAllPresent}>
                Mark all present
              </Button>
              <Button size="sm" onClick={save} disabled={markedCount === 0 || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save attendance'}
              </Button>
            </>
          ) : null}
        </CardHeaderRow>
        <CardContent>
          <FormError
            className="mb-3"
            message={saveMutation.error ? saveMutation.error.message : null}
          />
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
                      <FilterSelect
                        aria-label="Attendance"
                        value={rows[e.id]?.status ?? ''}
                        onChange={(value) =>
                          setRow(e.id, { status: value as '' | AttendanceStatus })
                        }
                        disabled={!canUpdate}
                      >
                        <option value="">Not marked</option>
                        {ATTENDANCE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {humanize(s)}
                          </option>
                        ))}
                      </FilterSelect>
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
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open);
          if (!open) removeSession.reset();
        }}
        title="Delete session?"
        description="This removes the session and its attendance records."
        isPending={removeSession.isPending}
        error={removeSession.error ? removeSession.error.message : null}
        onConfirm={() => removeSession.mutate()}
      />
    </div>
  );
}
