import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Pencil, Plus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink, backTo } from '@/components/BackLink';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, fullName, humanize } from '@/lib/utils';
import { BatchEnrollDialog } from './BatchEnrollDialog';
import { EnrollmentEditDialog } from './EnrollmentEditDialog';
import { InsideClassFormDialog } from './InsideClassFormDialog';
import { SessionsTab } from './SessionsTab';
import { classTypeLabel } from './helpers';
import { AssignmentDialog, type AssignmentRowLite } from '../volunteers/AssignmentDialog';
import type { InsideClassDetail, RosterEnrollment } from './types';

export function InsideClassDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const canOpenVolunteer = can('volunteers.read');
  const [assignmentState, setAssignmentState] = useState<AssignmentRowLite | 'new' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<RosterEnrollment | null>(null);

  const query = useQuery({
    queryKey: ['inside-classes', id],
    queryFn: () => api.get<InsideClassDetail>(`/inside-classes/${id}`),
    enabled: !!id,
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  const insideClass = query.data;
  const canUpdate = can('inside_classes.update');
  const canCreate = can('inside_classes.create');

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <BackLink fallbackTo="/inside-classes" fallbackLabel="Inside classes" />
        <PageHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              {insideClass.name}
              <StatusBadge status={insideClass.status} />
            </span>
          }
          description={
            <>
              <Link className="hover:underline" to={`/institutions/${insideClass.institution.id}`}>
                {insideClass.institution.name}
              </Link>{' '}
              ({insideClass.institution.state})
            </>
          }
          actions={
            <>
              {canUpdate && insideClass.status !== 'canceled' ? (
                <Button variant="outline" onClick={() => navigate('close-out')}>
                  <ClipboardCheck className="h-4 w-4" /> Close out
                </Button>
              ) : null}
              {canUpdate ? (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class information</CardTitle>
        </CardHeader>
        <CardContent>
          <DescriptionList columns={3}>
            <InfoItem label="Type">{classTypeLabel(insideClass.classType)}</InfoItem>
            <InfoItem label="Start date">{formatDate(insideClass.startDate)}</InfoItem>
            <InfoItem label="End date">{formatDate(insideClass.endDate)}</InfoItem>
            <InfoItem label="Staff lead">
              {insideClass.staffLead
                ? `${insideClass.staffLead.firstName} ${insideClass.staffLead.lastName}`
                : '—'}
            </InfoItem>
            <InfoItem label="Enrolled">{insideClass.enrollments.length}</InfoItem>
            {insideClass.notes ? (
              <InfoItem label="Notes" className="sm:col-span-2 lg:col-span-3">
                <span className="whitespace-pre-wrap">{insideClass.notes}</span>
              </InfoItem>
            ) : null}
          </DescriptionList>
        </CardContent>
      </Card>

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster ({insideClass.enrollments.length})</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="volunteers">
            Volunteers ({insideClass.volunteerAssignments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-3">
          <div className="flex justify-end">
            {canCreate && insideClass.status !== 'canceled' ? (
              <Button onClick={() => setBatchOpen(true)}>
                <UserPlus className="h-4 w-4" /> Batch enroll
              </Button>
            ) : null}
          </div>
          {insideClass.enrollments.length === 0 ? (
            <EmptyState
              title="No participants enrolled"
              hint="Use batch enroll to add the roster in one step"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Left early</TableHead>
                    {canUpdate ? <TableHead className="w-16" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insideClass.enrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell className="font-medium">
                        <Link
                          className="hover:underline"
                          to={`/participants/${enrollment.participantProfileId}`}
                        >
                          {fullName(enrollment.participantProfile.person)}
                        </Link>
                      </TableCell>
                      <TableCell>{enrollment.participantProfile.participantNumber ?? '—'}</TableCell>
                      <TableCell>{formatDate(enrollment.enrollmentDate)}</TableCell>
                      <TableCell>
                        <StatusBadge status={enrollment.completionStatus} />
                      </TableCell>
                      <TableCell>{formatDate(enrollment.completionDate)}</TableCell>
                      <TableCell>
                        <StatusBadge status={enrollment.finalAssessment} />
                      </TableCell>
                      <TableCell>
                        {enrollment.leftEarlyDate ? (
                          <span>
                            {formatDate(enrollment.leftEarlyDate)}
                            {enrollment.leftEarlyReason ? (
                              <span className="block max-w-48 truncate text-xs text-muted-foreground">
                                {enrollment.leftEarlyReason}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      {canUpdate ? (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingEnrollment(enrollment)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsTab classId={insideClass.id} roster={insideClass.enrollments} />
        </TabsContent>

        <TabsContent value="volunteers">
          {can('volunteers.create') ? (
            <div className="mb-3 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setAssignmentState('new')}>
                <Plus className="h-4 w-4" /> Assign volunteer
              </Button>
            </div>
          ) : null}
          {insideClass.volunteerAssignments.length === 0 ? (
            <EmptyState title="No volunteers assigned to this class" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Volunteer</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {insideClass.volunteerAssignments.map((assignment) => (
                  <TableRow
                    key={assignment.id}
                    className={cn(
                      canOpenVolunteer && 'cursor-pointer transition-colors hover:bg-muted/60',
                    )}
                    onClick={
                      canOpenVolunteer
                        ? () =>
                            navigate(
                              `/volunteers/${assignment.volunteerProfile.id}`,
                              backTo(`/inside-classes/${insideClass.id}`, 'Class record'),
                            )
                        : undefined
                    }
                  >
                    <TableCell className={cn('font-medium', canOpenVolunteer && 'text-primary')}>
                      {assignment.volunteerProfile.person.firstName}{' '}
                      {assignment.volunteerProfile.person.lastName}
                    </TableCell>
                    <TableCell>{assignment.role ? humanize(assignment.role) : '—'}</TableCell>
                    <TableCell>{formatDate(assignment.startDate)}</TableCell>
                    <TableCell>{formatDate(assignment.endDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={assignment.status} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {can('volunteers.update') ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Edit assignment"
                          onClick={() => setAssignmentState(assignment)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      <InsideClassFormDialog open={editOpen} onOpenChange={setEditOpen} insideClass={insideClass} />
      <AssignmentDialog
        context={{
          institutionId: insideClass.institutionId,
          insideClassId: insideClass.id,
          invalidate: [['inside-classes', insideClass.id]],
        }}
        state={assignmentState}
        onClose={() => setAssignmentState(null)}
      />
      <BatchEnrollDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        classId={insideClass.id}
        roster={insideClass.enrollments}
      />
      {editingEnrollment ? (
        <EnrollmentEditDialog
          open={editingEnrollment !== null}
          onOpenChange={(open) => {
            if (!open) setEditingEnrollment(null);
          }}
          enrollment={editingEnrollment}
        />
      ) : null}
    </div>
  );
}
