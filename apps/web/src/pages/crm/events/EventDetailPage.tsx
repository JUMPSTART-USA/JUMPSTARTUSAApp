import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Trash2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, type BadgeProps } from '@/components/ui/badge';
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
import { ErrorState, PageLoader } from '@/components/ui/spinner';
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
import { cn, formatDate, formatMoney, fullName, humanize } from '@/lib/utils';
import { InfoItem } from '../shared';
import type { EventDetail, RegistrationStatus } from '../types';
import { EventFormDialog } from './EventFormDialog';
import { RegistrationDialog } from './RegistrationDialog';

const REGISTRATION_VARIANTS: Record<RegistrationStatus, BadgeProps['variant']> = {
  registered: 'secondary',
  attended: 'success',
  no_show: 'warning',
  canceled: 'destructive',
};

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['crm', 'events', 'detail', id],
    queryFn: () => api.get<EventDetail>(`/events/${id}`),
    enabled: Boolean(id),
  });

  const updateRegistration = useMutation({
    mutationFn: ({ registrationId, status }: { registrationId: string; status: RegistrationStatus }) =>
      api.patch(`/registrations/${registrationId}`, { status }),
    onSuccess: () => {
      setRegistrationError(null);
      queryClient.invalidateQueries({ queryKey: ['crm', 'events'] });
    },
    onError: (err) =>
      setRegistrationError(err instanceof Error ? err.message : 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'events'] });
      navigate('/events');
    },
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  const { event, registrations, revenue, expenses, net, donationsLinked } = query.data;
  const canUpdate = can('events.update');
  const activeRegistrations = registrations.filter((r) => r.status !== 'canceled');

  return (
    <div className="space-y-4">
      <Link
        to="/events"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Events
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(event.eventDate)}
            {event.eventType ? ` · ${event.eventType}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canUpdate ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          ) : null}
          {can('events.delete') ? (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Event info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoItem label="Campaign">
                {event.campaign ? (
                  <Link to={`/campaigns/${event.campaign.id}`} className="text-primary hover:underline">
                    {event.campaign.name}
                  </Link>
                ) : (
                  '—'
                )}
              </InfoItem>
              <InfoItem label="Attendance count">{event.attendanceCount ?? '—'}</InfoItem>
              <InfoItem label="Description">
                <span className="whitespace-pre-wrap">{event.description ?? '—'}</span>
              </InfoItem>
              <InfoItem label="Notes">
                <span className="whitespace-pre-wrap">{event.notes ?? '—'}</span>
              </InfoItem>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoItem label="Revenue">
                <span className="tabular-nums">{formatMoney(revenue)}</span>
              </InfoItem>
              <InfoItem label="Expenses">
                <span className="tabular-nums">{formatMoney(expenses)}</span>
              </InfoItem>
              <InfoItem label="Net">
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    net >= 0 ? 'text-emerald-600' : 'text-red-600',
                  )}
                >
                  {formatMoney(net)}
                </span>
              </InfoItem>
              <InfoItem label="Donations linked">
                <span className="tabular-nums">
                  {donationsLinked.count} gift{donationsLinked.count === 1 ? '' : 's'} ·{' '}
                  {formatMoney(donationsLinked.total)}
                </span>
              </InfoItem>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Registrations{' '}
          <span className="text-sm font-normal text-muted-foreground">
            ({activeRegistrations.length} active)
          </span>
        </h2>
        {canUpdate ? (
          <Button onClick={() => setRegistrationOpen(true)}>
            <Plus className="h-4 w-4" /> Add registration
          </Button>
        ) : null}
      </div>

      {registrationError ? <ErrorState error={new Error(registrationError)} /> : null}

      {registrations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No registrations yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Checked in</TableHead>
              <TableHead>Notes</TableHead>
              {canUpdate ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {registrations.map((registration) => (
              <TableRow key={registration.id}>
                <TableCell className="font-medium">
                  {registration.person
                    ? fullName(registration.person)
                    : (registration.externalName ?? '—')}
                  {!registration.person && registration.externalName ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">(guest)</span>
                  ) : null}
                </TableCell>
                <TableCell>{registration.externalEmail ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={REGISTRATION_VARIANTS[registration.status]}>
                    {humanize(registration.status)}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(registration.checkedInAt)}</TableCell>
                <TableCell className="max-w-[240px] truncate">{registration.notes ?? '—'}</TableCell>
                {canUpdate ? (
                  <TableCell className="text-right">
                    {registration.status === 'registered' ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updateRegistration.isPending}
                          onClick={() =>
                            updateRegistration.mutate({
                              registrationId: registration.id,
                              status: 'attended',
                            })
                          }
                        >
                          <UserCheck className="h-3.5 w-3.5" /> Check in
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={updateRegistration.isPending}
                          onClick={() =>
                            updateRegistration.mutate({
                              registrationId: registration.id,
                              status: 'no_show',
                            })
                          }
                        >
                          No show
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={updateRegistration.isPending}
                          onClick={() =>
                            updateRegistration.mutate({
                              registrationId: registration.id,
                              status: 'canceled',
                            })
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <EventFormDialog open={editOpen} onOpenChange={setEditOpen} event={event} />
      {id ? (
        <RegistrationDialog
          open={registrationOpen}
          onOpenChange={setRegistrationOpen}
          eventId={id}
        />
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete event?</DialogTitle>
            <DialogDescription>
              “{event.name}” will be removed from lists. Linked donations keep their history.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError ? <ErrorState error={deleteMutation.error} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
