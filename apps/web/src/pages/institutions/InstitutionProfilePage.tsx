import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardHeaderRow, CardTitle } from '@/components/ui/card';
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
import { BackLink, backTo } from '@/components/BackLink';
import { AssignmentDialog, type AssignmentRowLite } from '../volunteers/AssignmentDialog';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, fullName, humanize } from '@/lib/utils';
import { InstitutionFormDialog } from './InstitutionFormDialog';
import type { InstitutionProfile } from './types';

function ContactBlock({
  heading,
  name,
  role,
  phone,
  email,
}: {
  heading: string;
  name: string | null;
  role?: string | null;
  phone: string | null;
  email: string | null;
}) {
  return (
    <InfoItem label={heading}>
      <span className="block font-medium">
        {name ?? '—'}
        {role ? <span className="ml-1 font-normal text-muted-foreground">({role})</span> : null}
      </span>
      <span className="block">{phone ?? '—'}</span>
      <span className="block">{email ?? '—'}</span>
    </InfoItem>
  );
}

export function InstitutionProfilePage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const canOpenVolunteer = can('volunteers.read');
  const canManageVolunteers = can('volunteers.create');
  const [assignmentState, setAssignmentState] = useState<AssignmentRowLite | 'new' | null>(null);

  const query = useQuery({
    queryKey: ['institutions', id, 'profile'],
    queryFn: () => api.get<InstitutionProfile>(`/institutions/${id}/profile`),
    enabled: !!id,
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  const { institution, classes, participantsServedCount, volunteerAssignments, currentParticipants } =
    query.data;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <BackLink fallbackTo="/institutions" fallbackLabel="Institutions" />
        <PageHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              {institution.name}
              {institution.active ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="outline">Inactive</Badge>
              )}
            </span>
          }
          description={[institution.institutionType, institution.city, institution.state]
            .filter(Boolean)
            .join(' · ')}
          actions={
            can('institutions.update') ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            ) : null
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contact information</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList columns={3}>
              <InfoItem label="Facility">
                <span className="block">{institution.addressLine1 ?? '—'}</span>
                <span className="block">
                  {[institution.city, institution.state, institution.zip]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </span>
                <span className="block">{institution.mainPhone ?? '—'}</span>
              </InfoItem>
              <ContactBlock
                heading="Chaplain"
                name={institution.chaplainName}
                phone={institution.chaplainPhone}
                email={institution.chaplainEmail}
              />
              <ContactBlock
                heading="Primary contact"
                name={institution.primaryContactName}
                role={institution.primaryContactRole}
                phone={institution.primaryContactPhone}
                email={institution.primaryContactEmail}
              />
              {institution.notes ? (
                <InfoItem label="Notes" className="sm:col-span-2 lg:col-span-3">
                  <span className="whitespace-pre-wrap">{institution.notes}</span>
                </InfoItem>
              ) : null}
            </DescriptionList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>At a glance</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-semibold">{participantsServedCount}</p>
              <p className="text-xs text-muted-foreground">Participants served</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{classes.length}</p>
              <p className="text-xs text-muted-foreground">Classes held</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{volunteerAssignments.length}</p>
              <p className="text-xs text-muted-foreground">Volunteer assignments</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {currentParticipants !== undefined ? (
        // Omitted by the API without participants.read — the card hides with it.
        <Card>
          <CardHeader>
            <CardTitle>Currently housed</CardTitle>
          </CardHeader>
          <CardContent>
            {currentParticipants.length === 0 ? (
              <EmptyState title="No participants currently at this institution" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Inside status</TableHead>
                    <TableHead>Arrived</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentParticipants.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer transition-colors hover:bg-muted/60"
                      onClick={() =>
                        navigate(
                          `/participants/${row.participantProfile.id}`,
                          backTo(`/institutions/${institution.id}`, 'Institution profile'),
                        )
                      }
                    >
                      <TableCell className="font-medium text-primary">
                        {fullName(row.participantProfile.person)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.participantProfile.participantNumber}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.participantProfile.insideStatus} />
                      </TableCell>
                      <TableCell>{formatDate(row.startDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Classes held</CardTitle>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <EmptyState title="No classes at this institution yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/inside-classes/${row.id}`)}
                  >
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.classType ?? '—'}</TableCell>
                    <TableCell>{formatDate(row.startDate)}</TableCell>
                    <TableCell>{formatDate(row.endDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right">{row._count.enrollments}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeaderRow title="Volunteers assigned">
          {canManageVolunteers ? (
            <Button size="sm" variant="outline" onClick={() => setAssignmentState('new')}>
              <Plus className="h-4 w-4" /> Assign volunteer
            </Button>
          ) : null}
        </CardHeaderRow>
        <CardContent>
          {volunteerAssignments.length === 0 ? (
            <EmptyState title="No volunteers assigned to this institution" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Volunteer</TableHead>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {volunteerAssignments.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      canOpenVolunteer && 'cursor-pointer transition-colors hover:bg-muted/60',
                    )}
                    onClick={
                      canOpenVolunteer
                        ? () =>
                            navigate(
                              `/volunteers/${row.volunteerProfile.id}`,
                              backTo(`/institutions/${institution.id}`, 'Institution profile'),
                            )
                        : undefined
                    }
                  >
                    <TableCell className={cn('font-medium', canOpenVolunteer && 'text-primary')}>
                      {row.volunteerProfile.person.firstName} {row.volunteerProfile.person.lastName}
                    </TableCell>
                    <TableCell>{humanize(row.assignmentType)}</TableCell>
                    <TableCell>{row.role ?? '—'}</TableCell>
                    <TableCell>{formatDate(row.startDate)}</TableCell>
                    <TableCell>{formatDate(row.endDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {can('volunteers.update') ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Edit assignment"
                          onClick={() => setAssignmentState(row)}
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
        </CardContent>
      </Card>

      <InstitutionFormDialog open={editOpen} onOpenChange={setEditOpen} institution={institution} />
      <AssignmentDialog
        context={{ institutionId: institution.id, invalidate: [['institutions', institution.id, 'profile']] }}
        state={assignmentState}
        onClose={() => setAssignmentState(null)}
      />
    </div>
  );
}
