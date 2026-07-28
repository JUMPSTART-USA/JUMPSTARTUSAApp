import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, StatusBadge } from '@/components/ui/badge';
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
import { backTo } from '@/components/BackLink';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, humanize } from '@/lib/utils';
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
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{heading}</p>
      <p className="text-sm font-medium">
        {name ?? '—'}
        {role ? <span className="ml-1 font-normal text-muted-foreground">({role})</span> : null}
      </p>
      <p className="text-sm">{phone ?? '—'}</p>
      <p className="text-sm">{email ?? '—'}</p>
    </div>
  );
}

export function InstitutionProfilePage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const canOpenVolunteer = can('volunteers.read');

  const query = useQuery({
    queryKey: ['institutions', id, 'profile'],
    queryFn: () => api.get<InstitutionProfile>(`/institutions/${id}/profile`),
    enabled: !!id,
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  const { institution, classes, participantsServedCount, volunteerAssignments } = query.data;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            to="/institutions"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Institutions
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{institution.name}</h1>
            {institution.active ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="outline">Inactive</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {[institution.institutionType, institution.city, institution.state]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {can('institutions.update') ? (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contact information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Facility</p>
                <p className="text-sm">{institution.addressLine1 ?? '—'}</p>
                <p className="text-sm">
                  {[institution.city, institution.state, institution.zip]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
                <p className="text-sm">{institution.mainPhone ?? '—'}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
            </div>
            {institution.notes ? (
              <div className="space-y-1 border-t pt-3">
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-sm">{institution.notes}</p>
              </div>
            ) : null}
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
        <CardHeader>
          <CardTitle>Volunteers assigned</CardTitle>
        </CardHeader>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InstitutionFormDialog open={editOpen} onOpenChange={setEditOpen} institution={institution} />
    </div>
  );
}
