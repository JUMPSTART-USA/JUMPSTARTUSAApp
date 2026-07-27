import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Pencil, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { BatchEnrollDialog } from './BatchEnrollDialog';
import { EnrollmentEditDialog } from './EnrollmentEditDialog';
import { InsideClassFormDialog } from './InsideClassFormDialog';
import { SessionsTab } from './SessionsTab';
import type { InsideClassDetail, RosterEnrollment } from './types';

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{children}</p>
    </div>
  );
}

export function InsideClassDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <BackLink fallbackTo="/inside-classes" fallbackLabel="Inside classes" />
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{insideClass.name}</h1>
            <StatusBadge status={insideClass.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            <Link className="hover:underline" to={`/institutions/${insideClass.institution.id}`}>
              {insideClass.institution.name}
            </Link>{' '}
            ({insideClass.institution.state})
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <InfoItem label="Type">{insideClass.classType ?? '—'}</InfoItem>
          <InfoItem label="Start date">{formatDate(insideClass.startDate)}</InfoItem>
          <InfoItem label="End date">{formatDate(insideClass.endDate)}</InfoItem>
          <InfoItem label="Staff lead">
            {insideClass.staffLead
              ? `${insideClass.staffLead.firstName} ${insideClass.staffLead.lastName}`
              : '—'}
          </InfoItem>
          <InfoItem label="Enrolled">{insideClass.enrollments.length}</InfoItem>
          {insideClass.notes ? (
            <div className="sm:col-span-2 lg:col-span-5">
              <InfoItem label="Notes">
                <span className="whitespace-pre-wrap">{insideClass.notes}</span>
              </InfoItem>
            </div>
          ) : null}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {insideClass.volunteerAssignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">
                      {assignment.volunteerProfile.person.firstName}{' '}
                      {assignment.volunteerProfile.person.lastName}
                    </TableCell>
                    <TableCell>{assignment.role ? humanize(assignment.role) : '—'}</TableCell>
                    <TableCell>{formatDate(assignment.startDate)}</TableCell>
                    <TableCell>{formatDate(assignment.endDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={assignment.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      <InsideClassFormDialog open={editOpen} onOpenChange={setEditOpen} insideClass={insideClass} />
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
