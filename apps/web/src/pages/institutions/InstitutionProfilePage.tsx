import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardHeaderRow, CardTitle } from '@/components/ui/card';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import { StatTile } from '@/components/ui/stat';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BackLink, backTo } from '@/components/BackLink';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AssignmentDialog, type AssignmentRowLite } from '../volunteers/AssignmentDialog';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, fullName, humanize } from '@/lib/utils';
import { InstitutionContactDialog } from './InstitutionContactDialog';
import { InstitutionFormDialog } from './InstitutionFormDialog';
import type { InstitutionContactRow, InstitutionProfile } from './types';

export function InstitutionProfilePage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const canOpenVolunteer = can('volunteers.read');
  const canManageVolunteers = can('volunteers.create');
  const canEditInstitution = can('institutions.update');
  const [assignmentState, setAssignmentState] = useState<AssignmentRowLite | 'new' | null>(null);
  const [contactDialog, setContactDialog] = useState<InstitutionContactRow | 'new' | null>(null);
  const [deleteContactTarget, setDeleteContactTarget] = useState<InstitutionContactRow | null>(null);

  const deleteContact = useMutation({
    mutationFn: (contactId: string) => api.delete(`/institutions/${id}/contacts/${contactId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['institutions'] }),
  });

  const query = useQuery({
    queryKey: ['institutions', id, 'profile'],
    queryFn: () => api.get<InstitutionProfile>(`/institutions/${id}/profile`),
    enabled: !!id,
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!query.data) return null;

  const { institution, contacts, classes, participantsServedCount, volunteerAssignments, currentParticipants } =
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
            <CardTitle>Facility information</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList columns={3}>
              <InfoItem label="Address">
                <span className="block">{institution.addressLine1 ?? '—'}</span>
                <span className="block">
                  {[institution.city, institution.state, institution.zip]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </span>
              </InfoItem>
              <InfoItem label="Mailing address">
                {institution.mailingSameAsPrimary ? (
                  'Same as address'
                ) : (
                  <>
                    <span className="block">{institution.mailingAddressLine1 ?? '—'}</span>
                    <span className="block">
                      {[institution.mailingCity, institution.mailingState, institution.mailingZip]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </span>
                  </>
                )}
              </InfoItem>
              <InfoItem label="Main phone">{institution.mainPhone ?? '—'}</InfoItem>
              <InfoItem label="Type">{institution.institutionType ?? '—'}</InfoItem>
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
            <StatTile label="Participants served" value={participantsServedCount} />
            <StatTile label="Classes held" value={classes.length} />
            <StatTile label="Volunteer assignments" value={volunteerAssignments.length} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeaderRow title="Contacts">
          {canEditInstitution ? (
            <Button size="sm" variant="outline" onClick={() => setContactDialog('new')}>
              <Plus className="h-4 w-4" /> Add contact
            </Button>
          ) : null}
        </CardHeaderRow>
        <CardContent>
          {contacts.length === 0 ? (
            <EmptyState
              title="No contacts recorded"
              hint="Add chaplains, wardens, program and release coordinators — any number."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.role}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.phone ?? '—'}</TableCell>
                    <TableCell>{c.email ?? '—'}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {c.notes ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEditInstitution ? (
                        <span className="inline-flex">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setContactDialog(c)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={deleteContact.isPending}
                            onClick={() => {
                              deleteContact.reset();
                              setDeleteContactTarget(c);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        if (
                          (e.target as HTMLElement).closest(
                            'a,button,input,select,textarea,[role="button"]',
                          )
                        )
                          return;
                        navigate(
                          `/participants/${row.participantProfile.id}`,
                          backTo(`/institutions/${institution.id}`, 'Institution profile'),
                        );
                      }}
                    >
                      <TableCell className="font-medium text-primary">
                        {/* The row click is mouse-only; this link is the keyboard path in. */}
                        <Link
                          to={`/participants/${row.participantProfile.id}`}
                          {...backTo(`/institutions/${institution.id}`, 'Institution profile')}
                          className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {fullName(row.participantProfile.person)}
                        </Link>
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
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      if (
                        (e.target as HTMLElement).closest(
                          'a,button,input,select,textarea,[role="button"]',
                        )
                      )
                        return;
                      navigate(`/inside-classes/${row.id}`);
                    }}
                  >
                    <TableCell className="font-medium">
                      {/* The row click is mouse-only; this link is the keyboard path in. */}
                      <Link
                        to={`/inside-classes/${row.id}`}
                        className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {row.name}
                      </Link>
                    </TableCell>
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
                        ? (e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
                              return;
                            if (
                              (e.target as HTMLElement).closest(
                                'a,button,input,select,textarea,[role="button"]',
                              )
                            )
                              return;
                            navigate(
                              `/volunteers/${row.volunteerProfile.id}`,
                              backTo(`/institutions/${institution.id}`, 'Institution profile'),
                            );
                          }
                        : undefined
                    }
                  >
                    <TableCell className={cn('font-medium', canOpenVolunteer && 'text-primary')}>
                      {/* Keyboard path in, only where the row is actually openable. */}
                      {canOpenVolunteer ? (
                        <Link
                          to={`/volunteers/${row.volunteerProfile.id}`}
                          {...backTo(`/institutions/${institution.id}`, 'Institution profile')}
                          className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {row.volunteerProfile.person.firstName}{' '}
                          {row.volunteerProfile.person.lastName}
                        </Link>
                      ) : (
                        <>
                          {row.volunteerProfile.person.firstName}{' '}
                          {row.volunteerProfile.person.lastName}
                        </>
                      )}
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
      <InstitutionContactDialog
        institutionId={institution.id}
        existing={contactDialog !== null && contactDialog !== 'new' ? contactDialog : null}
        open={contactDialog !== null}
        onOpenChange={(o) => !o && setContactDialog(null)}
      />
      <ConfirmDialog
        open={deleteContactTarget !== null}
        onOpenChange={(o) => !o && setDeleteContactTarget(null)}
        title="Remove contact"
        description={
          deleteContactTarget
            ? `Remove ${deleteContactTarget.name} (${deleteContactTarget.role})?`
            : undefined
        }
        confirmLabel="Delete"
        isPending={deleteContact.isPending}
        error={deleteContact.error ? deleteContact.error.message : null}
        onConfirm={() => {
          if (deleteContactTarget) {
            deleteContact.mutate(deleteContactTarget.id, {
              onSuccess: () => setDeleteContactTarget(null),
            });
          }
        }}
      />
      <AssignmentDialog
        context={{ institutionId: institution.id, invalidate: [['institutions', institution.id, 'profile']] }}
        state={assignmentState}
        onClose={() => setAssignmentState(null)}
      />
    </div>
  );
}
