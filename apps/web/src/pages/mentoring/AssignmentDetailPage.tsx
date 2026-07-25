import { zodResolver } from '@hookform/resolvers/zod';
import {
  SESSION_MODES,
  mentorAssignmentEndSchema,
  mentorAssignmentPauseSchema,
  mentorSessionLogSchema,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { ErrorState, PageLoader } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { applyApiErrors, emptyToUndefined, type AssignmentView, type SessionLogView } from './types';

function PauseDialog({ assignment, onClose }: { assignment: AssignmentView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<{ pauseReason?: string }>({
    resolver: zodResolver(mentorAssignmentPauseSchema) as unknown as Resolver<{
      pauseReason?: string;
    }>,
  });

  const mutation = useMutation({
    mutationFn: (values: { pauseReason?: string }) =>
      api.post(`/mentoring/assignments/${assignment.id}/pause`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiErrors(err, (n, e) => form.setError(n as never, e))),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pause assignment</DialogTitle>
          <DialogDescription>Pausing requires a reason (§6.7).</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => {
            setTopError(null);
            mutation.mutate(v);
          })}
        >
          {topError ? <ErrorState error={new Error(topError)} /> : null}
          <FormField label="Reason" required error={form.formState.errors.pauseReason}>
            <Textarea rows={3} {...form.register('pauseReason')} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Pausing…' : 'Pause'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EndDialog({ assignment, onClose }: { assignment: AssignmentView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<{ endDate?: string; endReason?: string }>({
    resolver: zodResolver(mentorAssignmentEndSchema) as unknown as Resolver<{
      endDate?: string;
      endReason?: string;
    }>,
    defaultValues: { endDate: new Date().toISOString().slice(0, 10) },
  });

  const mutation = useMutation({
    mutationFn: (values: { endDate?: string; endReason?: string }) =>
      api.post(`/mentoring/assignments/${assignment.id}/end`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiErrors(err, (n, e) => form.setError(n as never, e))),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End assignment</DialogTitle>
          <DialogDescription>
            Ended assignments stay closed — a new match must be proposed to restart.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => {
            setTopError(null);
            mutation.mutate(v);
          })}
        >
          {topError ? <ErrorState error={new Error(topError)} /> : null}
          <FormField label="End date" required error={form.formState.errors.endDate}>
            <Input type="date" {...form.register('endDate')} />
          </FormField>
          <FormField label="Reason" required error={form.formState.errors.endReason}>
            <Textarea rows={3} {...form.register('endReason')} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={mutation.isPending}>
              {mutation.isPending ? 'Ending…' : 'End assignment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SessionFormValues {
  mentorAssignmentId: string;
  sessionDate?: string;
  mode?: string;
  durationMinutes?: number | string;
  participantProgress?: string;
  concernsEscalated: boolean;
  notes?: string;
}

function LogSessionDialog({
  assignment,
  onClose,
}: {
  assignment: AssignmentView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<SessionFormValues>({
    resolver: zodResolver(mentorSessionLogSchema) as unknown as Resolver<SessionFormValues>,
    defaultValues: {
      mentorAssignmentId: assignment.id,
      sessionDate: new Date().toISOString().slice(0, 10),
      concernsEscalated: false,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: SessionFormValues) => api.post('/mentoring/session-logs', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiErrors(err, (n, e) => form.setError(n as never, e))),
  });

  const concerns = form.watch('concernsEscalated');

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log mentoring session</DialogTitle>
          <DialogDescription>
            {assignment.mentorName} · {assignment.participantName}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => {
            setTopError(null);
            mutation.mutate(v);
          })}
        >
          {topError ? <ErrorState error={new Error(topError)} /> : null}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Session date" required error={form.formState.errors.sessionDate}>
              <Input type="date" {...form.register('sessionDate')} />
            </FormField>
            <FormField label="Mode" required error={form.formState.errors.mode}>
              <Select {...form.register('mode', { setValueAs: emptyToUndefined })}>
                <option value="">Select…</option>
                {SESSION_MODES.map((m) => (
                  <option key={m} value={m}>
                    {humanize(m)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Duration (minutes)" error={form.formState.errors.durationMinutes}>
              <Input
                type="number"
                min={1}
                {...form.register('durationMinutes', { setValueAs: emptyToUndefined })}
              />
            </FormField>
            <FormField
              label="Participant progress"
              error={form.formState.errors.participantProgress}
            >
              <Select {...form.register('participantProgress', { setValueAs: emptyToUndefined })}>
                <option value="">Not assessed</option>
                {(['improving', 'steady', 'struggling'] as const).map((p) => (
                  <option key={p} value={p}>
                    {humanize(p)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {/* Escalation is the signal case managers act on — kept prominent. */}
          <label
            className={
              concerns
                ? 'flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 p-3'
                : 'flex items-start gap-2 rounded-md border p-3'
            }
          >
            <Checkbox {...form.register('concernsEscalated')} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-medium">Concerns escalated</span>
              <span className="block text-muted-foreground">
                Check when the mentor raised a concern that needs case-manager follow-up.
              </span>
            </span>
          </label>

          <FormField label="Notes" error={form.formState.errors.notes}>
            <Textarea rows={3} {...form.register('notes')} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Log session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'pause' | 'end' | 'session' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<ListState>({
    ...initialListState,
    sortBy: 'sessionDate',
    sortDir: 'desc',
    pageSize: 10,
  });

  const query = useQuery({
    queryKey: ['mentoring', 'assignment', id],
    queryFn: () => api.get<AssignmentView>(`/mentoring/assignments/${id}`),
    enabled: !!id,
  });

  const sessions = useQuery({
    queryKey: ['mentoring', 'session-logs', id, sessionState],
    queryFn: () =>
      api.get<Paged<SessionLogView>>(
        `/mentoring/session-logs${qs({
          mentorAssignmentId: id,
          page: sessionState.page,
          pageSize: sessionState.pageSize,
          sortBy: sessionState.sortBy,
          sortDir: sessionState.sortDir,
        })}`,
      ),
    enabled: !!id,
  });

  // Route guard is mentoring.read: the API enforces that the caller is the
  // participant's assigned case manager (or case-management staff) — a 403
  // here is surfaced, not hidden.
  const activate = useMutation({
    mutationFn: () => api.post(`/mentoring/assignments/${id}/activate`),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
    },
    onError: (err) => setActionError(applyApiErrors(err, () => undefined)),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  const assignment = query.data!;

  const sessionColumns: Column<SessionLogView>[] = [
    {
      key: 'sessionDate',
      header: 'Date',
      sortKey: 'sessionDate',
      render: (s) => formatDate(s.sessionDate),
    },
    { key: 'mode', header: 'Mode', render: (s) => humanize(s.mode) },
    {
      key: 'duration',
      header: 'Duration',
      render: (s) => (s.durationMinutes ? `${s.durationMinutes} min` : '—'),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (s) => (s.participantProgress ? humanize(s.participantProgress) : '—'),
    },
    {
      key: 'concerns',
      header: 'Concerns',
      render: (s) =>
        s.concernsEscalated ? (
          <Badge variant="warning">
            <AlertTriangle className="mr-1 h-3 w-3" /> Escalated
          </Badge>
        ) : (
          '—'
        ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (s) => (
        <span className="block max-w-64 truncate" title={s.notes ?? undefined}>
          {s.notes ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            <Link to=".." relative="path" className="hover:underline">
              Assignments
            </Link>{' '}
            / detail
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {assignment.mentorName}
            <span className="text-muted-foreground">→</span>
            {assignment.participantName}
            <StatusBadge status={assignment.status} />
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {(assignment.status === 'proposed' || assignment.status === 'paused') ? (
            <Button onClick={() => activate.mutate()} disabled={activate.isPending}>
              {activate.isPending
                ? 'Activating…'
                : assignment.status === 'paused'
                  ? 'Resume'
                  : 'Activate'}
            </Button>
          ) : null}
          {assignment.status === 'active' && can('mentoring.update') ? (
            <Button variant="outline" onClick={() => setDialog('pause')}>
              Pause
            </Button>
          ) : null}
          {assignment.status !== 'ended' && can('mentoring.update') ? (
            <Button variant="outline" onClick={() => setDialog('end')}>
              End
            </Button>
          ) : null}
          {assignment.status !== 'proposed' && can('mentoring.create') ? (
            <Button variant="secondary" onClick={() => setDialog('session')}>
              Log session
            </Button>
          ) : null}
        </div>
      </div>

      {actionError ? <ErrorState error={new Error(actionError)} /> : null}

      {assignment.status === 'proposed' ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Proposed match — only the participant&apos;s assigned case manager (or
          case-management staff) can activate it. Sessions cannot be logged until then.
        </div>
      ) : null}
      {assignment.status === 'paused' && assignment.pauseReason ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Paused: {assignment.pauseReason}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mentor</span>
              <span>{assignment.mentorName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Participant</span>
              <Link
                to={`/participants/${assignment.participantProfileId}`}
                className="text-primary hover:underline"
              >
                {assignment.participantName}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Participant #</span>
              <span>{assignment.participantNumber}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Proposed</span>
              <span>{formatDate(assignment.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span>{formatDate(assignment.startDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ended</span>
              <span>{formatDate(assignment.endDate)}</span>
            </div>
            {assignment.endReason ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">End reason</span>
                <span className="text-right">{assignment.endReason}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Match</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cadence</span>
              <span>{assignment.meetingCadence ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Rationale</span>
              <p className="mt-1">{assignment.matchRationale ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session logs</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.isError ? (
            <ErrorState error={sessions.error} />
          ) : (
            <DataTable
              columns={sessionColumns}
              data={sessions.data}
              isLoading={sessions.isLoading}
              state={sessionState}
              onStateChange={setSessionState}
              emptyMessage="No sessions logged yet"
            />
          )}
        </CardContent>
      </Card>

      {dialog === 'pause' ? (
        <PauseDialog assignment={assignment} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'end' ? (
        <EndDialog assignment={assignment} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'session' ? (
        <LogSessionDialog assignment={assignment} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
