import {
  SESSION_MODES,
  mentorAssignmentEndSchema,
  mentorAssignmentPauseSchema,
  mentorSessionLogSchema,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, PageLoader } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useListParams } from '@/lib/list-params';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { emptyToUndefined, type AssignmentView, type SessionLogView } from './types';

function PauseDialog({ assignment, onClose }: { assignment: AssignmentView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<{ pauseReason?: string }>({
    resolver: formResolver<{ pauseReason?: string }>(mentorAssignmentPauseSchema),
  });

  const mutation = useMutation({
    mutationFn: (values: { pauseReason?: string }) =>
      api.post(`/mentoring/assignments/${assignment.id}/pause`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
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
          <FormError message={topError} />
          <FormField label="Reason" required error={form.formState.errors.pauseReason}>
            <Textarea rows={3} {...form.register('pauseReason')} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Pause'}
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
    resolver: formResolver<{ endDate?: string; endReason?: string }>(mentorAssignmentEndSchema),
    defaultValues: { endDate: todayInput() },
  });

  const mutation = useMutation({
    mutationFn: (values: { endDate?: string; endReason?: string }) =>
      api.post(`/mentoring/assignments/${assignment.id}/end`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
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
          <FormError message={topError} />
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
              {mutation.isPending ? 'Saving…' : 'End assignment'}
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
    resolver: formResolver<SessionFormValues>(mentorSessionLogSchema),
    defaultValues: {
      mentorAssignmentId: assignment.id,
      sessionDate: todayInput(),
      concernsEscalated: false,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: SessionFormValues) => api.post('/mentoring/session-logs', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
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
          <FormError message={topError} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                ? 'flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3'
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
              {mutation.isPending ? 'Saving…' : 'Create'}
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
  /**
   * pageSize is passed in options, NOT left to the default: the hook keeps it out
   * of the URL entirely (no screen offers a rows-per-page control), so omitting it
   * here would silently turn this 10-row list into 25.
   */
  const { listState: sessionState, onListStateChange: onSessionStateChange } = useListParams(
    {},
    { ns: 'sessions', sort: { by: 'sessionDate', dir: 'desc' }, pageSize: 10 },
  );

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
    onError: (err) => setActionError(applyApiError(err)),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
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
      <div className="text-sm text-muted-foreground">
        <Link to=".." relative="path" className="hover:underline">
          Assignments
        </Link>{' '}
        / detail
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {assignment.mentorName}
            <span className="text-muted-foreground">→</span>
            {assignment.participantName}
            <StatusBadge status={assignment.status} />
          </span>
        }
        actions={
          <>
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
          </>
        }
      />

      <FormError message={actionError} />

      {assignment.status === 'proposed' ? (
        <Notice variant="warning">
          Proposed match — only the participant&apos;s assigned case manager (or
          case-management staff) can activate it. Sessions cannot be logged until then.
        </Notice>
      ) : null}
      {assignment.status === 'paused' && assignment.pauseReason ? (
        <Notice variant="warning">Paused: {assignment.pauseReason}</Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Parties</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList columns={1}>
              <InfoItem label="Mentor">{assignment.mentorName}</InfoItem>
              <InfoItem label="Participant">
                <Link
                  to={`/participants/${assignment.participantProfileId}`}
                  className="text-primary hover:underline"
                >
                  {assignment.participantName}
                </Link>
              </InfoItem>
              <InfoItem label="Participant #">{assignment.participantNumber}</InfoItem>
            </DescriptionList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList columns={1}>
              <InfoItem label="Proposed">{formatDate(assignment.createdAt)}</InfoItem>
              <InfoItem label="Started">{formatDate(assignment.startDate)}</InfoItem>
              <InfoItem label="Ended">{formatDate(assignment.endDate)}</InfoItem>
              {assignment.endReason ? (
                <InfoItem label="End reason">{assignment.endReason}</InfoItem>
              ) : null}
            </DescriptionList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Match</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList columns={1}>
              <InfoItem label="Cadence">{assignment.meetingCadence ?? undefined}</InfoItem>
              <InfoItem label="Rationale">{assignment.matchRationale ?? undefined}</InfoItem>
            </DescriptionList>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session logs</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.isError ? (
            <ErrorState error={sessions.error} onRetry={sessions.refetch} />
          ) : (
            <DataTable
              columns={sessionColumns}
              data={sessions.data}
              isLoading={sessions.isLoading}
              state={sessionState}
              onStateChange={onSessionStateChange}
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
