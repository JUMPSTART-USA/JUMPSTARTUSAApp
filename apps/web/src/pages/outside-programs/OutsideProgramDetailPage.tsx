import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, fullName, humanize } from '@/lib/utils';
import { EnrollDialog, EnrollmentEditDialog } from './EnrollmentDialogs';
import { ProgramFormDialog } from './ProgramFormDialog';
import { SessionFormDialog } from './SessionFormDialog';
import { ConfirmDialog, InfoItem } from './shared';
import type { OutsideEnrollment, OutsideProgramDetail, OutsideSession } from './types';

export function OutsideProgramDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [editEnrollment, setEditEnrollment] = useState<OutsideEnrollment | null>(null);
  const [removeEnrollment, setRemoveEnrollment] = useState<OutsideEnrollment | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [rosterFilter, setRosterFilter] = useState('');

  const programQuery = useQuery({
    queryKey: ['outside-programs', 'detail', id],
    queryFn: () => api.get<OutsideProgramDetail>(`/outside-programs/${id}`),
  });

  const sessionsQuery = useQuery({
    queryKey: ['outside-programs', 'sessions', id],
    queryFn: () => api.get<OutsideSession[]>(`/outside-programs/${id}/sessions`),
  });

  const deleteProgram = useMutation({
    mutationFn: () => api.delete(`/outside-programs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outside-programs'] });
      navigate('/outside-programs');
    },
  });

  const deleteEnrollmentMutation = useMutation({
    mutationFn: (enrollmentId: string) =>
      api.delete(`/outside-programs/enrollments/${enrollmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outside-programs'] });
      setRemoveEnrollment(null);
    },
  });

  if (programQuery.isLoading) return <PageLoader />;
  if (programQuery.error) return <ErrorState error={programQuery.error} />;
  const program = programQuery.data;
  if (!program) return <ErrorState error={new Error('Outside program not found')} />;

  const activeCount = program.enrollments.filter(
    (e) => !['completed', 'left_early', 'removed', 'transferred'].includes(e.status),
  ).length;

  const filterText = rosterFilter.trim().toLowerCase();
  const roster = filterText
    ? program.enrollments.filter((e) =>
        `${fullName(e.participantProfile.person)} ${e.participantProfile.participantNumber}`
          .toLowerCase()
          .includes(filterText),
      )
    : program.enrollments;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <BackLink fallbackTo="/outside-programs" fallbackLabel="Outside programs" />
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
            <StatusBadge status={program.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {humanize(program.programType)}
            {program.location ? ` · ${program.location}` : ''}
            {program.state ? `, ${program.state}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {can('outside_programs.update') ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          ) : null}
          {can('outside_programs.delete') ? (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Program details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <InfoItem label="Schedule">{program.recurringSchedule ?? '—'}</InfoItem>
            <InfoItem label="Dates">
              {program.startDate || program.endDate
                ? `${formatDate(program.startDate)} – ${
                    program.endDate ? formatDate(program.endDate) : 'ongoing'
                  }`
                : '—'}
            </InfoItem>
            <InfoItem label="Staff lead">
              {program.staffLead
                ? `${program.staffLead.firstName} ${program.staffLead.lastName}`
                : '—'}
            </InfoItem>
            <InfoItem label="Volunteer lead">{program.volunteerLeadName ?? '—'}</InfoItem>
            <InfoItem label="Capacity">
              {program.capacity != null ? (
                <span>
                  {activeCount} / {program.capacity} active
                  {activeCount > program.capacity ? (
                    <span className="ml-1 text-xs font-medium text-red-600">over capacity</span>
                  ) : null}
                </span>
              ) : (
                `${activeCount} active`
              )}
            </InfoItem>
            <InfoItem label="Roster size">{program.enrollments.length}</InfoItem>
            <InfoItem label="Sessions">{sessionsQuery.data?.length ?? '—'}</InfoItem>
            <InfoItem label="Notes">{program.notes ?? '—'}</InfoItem>
          </dl>
        </CardContent>
      </Card>

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster ({program.enrollments.length})</TabsTrigger>
          <TabsTrigger value="sessions">Sessions ({sessionsQuery.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Input
              placeholder="Filter roster…"
              value={rosterFilter}
              onChange={(e) => setRosterFilter(e.target.value)}
              className="max-w-xs"
            />
            {can('outside_programs.create') ? (
              <Button onClick={() => setEnrollOpen(true)}>
                <UserPlus className="h-4 w-4" /> Enroll Participant
              </Button>
            ) : null}
          </div>
          {roster.length === 0 ? (
            <EmptyState
              title="No enrollments"
              hint={filterText ? 'No roster entries match the filter' : 'Enroll a participant to get started'}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participant</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Assessment</TableHead>
                  <TableHead className="w-32" />
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
                    <TableCell>{formatDate(e.enrollmentDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                    <TableCell>
                      {e.status === 'left_early'
                        ? `${formatDate(e.leftEarlyDate)} — ${e.leftEarlyReason ?? '—'}`
                        : formatDate(e.completionDate)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={e.completionAssessment} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {can('outside_programs.update') ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditEnrollment(e)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {can('outside_programs.delete') ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setRemoveEnrollment(e)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="sessions" className="space-y-3">
          <div className="flex justify-end">
            {can('outside_programs.create') ? (
              <Button onClick={() => setSessionOpen(true)}>
                <Plus className="h-4 w-4" /> Add Session
              </Button>
            ) : null}
          </div>
          {sessionsQuery.error ? <ErrorState error={sessionsQuery.error} /> : null}
          {sessionsQuery.data && sessionsQuery.data.length === 0 ? (
            <EmptyState title="No sessions yet" hint="Add a session to record attendance" />
          ) : sessionsQuery.data ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Attendance marked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionsQuery.data.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/outside-programs/sessions/${s.id}`)}
                  >
                    <TableCell className="font-medium">{formatDate(s.sessionDate)}</TableCell>
                    <TableCell>{s.topic ?? '—'}</TableCell>
                    <TableCell>{s._count?.attendance ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </TabsContent>
      </Tabs>

      <ProgramFormDialog open={editOpen} onOpenChange={setEditOpen} program={program} />
      <EnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        programId={program.id}
        programName={program.name}
      />
      <EnrollmentEditDialog
        open={editEnrollment !== null}
        onOpenChange={(o) => !o && setEditEnrollment(null)}
        enrollment={editEnrollment}
      />
      <SessionFormDialog
        open={sessionOpen}
        onOpenChange={setSessionOpen}
        programId={program.id}
        session={null}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) deleteProgram.reset();
        }}
        title="Delete program?"
        description="The program is soft-deleted and hidden from lists. Programs with open enrollments cannot be deleted — close them out first."
        onConfirm={() => deleteProgram.mutate()}
        busy={deleteProgram.isPending}
        error={deleteProgram.error}
      />
      <ConfirmDialog
        open={removeEnrollment !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRemoveEnrollment(null);
            deleteEnrollmentMutation.reset();
          }
        }}
        title="Remove enrollment?"
        description="Removal is for data errors only — participants who exited should be closed out with a status change so history is preserved."
        onConfirm={() =>
          removeEnrollment && deleteEnrollmentMutation.mutate(removeEnrollment.id)
        }
        busy={deleteEnrollmentMutation.isPending}
        error={deleteEnrollmentMutation.error}
      />
    </div>
  );
}
