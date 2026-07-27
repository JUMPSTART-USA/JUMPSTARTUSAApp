import { HIRING_STATUSES } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { Badge } from '@/components/ui/badge';
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
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { EmployerFormDialog } from './EmployerFormDialog';
import { EmploymentFormDialog } from './EmploymentFormDialog';
import { ConfirmDialog, EmploymentStatusBadge, HiringStatusBadge } from './shared';
import type { EmployerProfile } from './types';

export function EmployerProfilePage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [placementOpen, setPlacementOpen] = useState(false);

  const query = useQuery({
    queryKey: ['employers', id, 'profile'],
    queryFn: () => api.get<EmployerProfile>(`/employers/${id}/profile`),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/employers/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employers'] });
      navigate('/employers');
    },
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) {
    // The profile requires employment.read on top of employers.read — a 403
    // here usually means the module grant is missing, not a broken link.
    const err = query.error;
    const friendly =
      err instanceof ApiError && err.status === 403
        ? new Error(
            'You do not have permission to view employer profiles — they include participant employment records (requires employment.read).',
          )
        : err;
    return (
      <div className="space-y-4">
        <BackLink fallbackTo="/employers" fallbackLabel="Employers" />
        <ErrorState error={friendly} />
      </div>
    );
  }
  if (!query.data) return null;

  const { employer, employments, outcomes } = query.data;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <BackLink fallbackTo="/employers" fallbackLabel="Employers" />
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{employer.name}</h1>
            <HiringStatusBadge status={employer.hiringStatus} />
          </div>
          <p className="text-sm text-muted-foreground">
            {[employer.industry, employer.city, employer.state].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can('employment.create') ? (
            <Button onClick={() => setPlacementOpen(true)}>
              <Plus className="h-4 w-4" /> New placement
            </Button>
          ) : null}
          {can('employers.update') ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          ) : null}
          {can('employers.delete') ? (
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contact information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Contact person</p>
                <p className="text-sm font-medium">{employer.contactPerson ?? '—'}</p>
                <p className="text-sm">{employer.phone ?? '—'}</p>
                <p className="text-sm">{employer.email ?? '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Address</p>
                <p className="text-sm">{employer.addressLine1 ?? '—'}</p>
                <p className="text-sm">
                  {[employer.city, employer.state, employer.zip].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
            </div>
            {employer.notes ? (
              <div className="space-y-1 border-t pt-3">
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-sm">{employer.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hiring pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {HIRING_STATUSES.map((s) =>
                s === employer.hiringStatus ? (
                  <HiringStatusBadge key={s} status={s} />
                ) : (
                  <Badge key={s} variant="outline" className="opacity-50">
                    {humanize(s)}
                  </Badge>
                ),
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Current stage: {humanize(employer.hiringStatus)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Participants employed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3 text-center">
            <div>
              <p className="text-2xl font-semibold">{outcomes.placements}</p>
              <p className="text-xs text-muted-foreground">Placements</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{outcomes.currentlyActive}</p>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">{outcomes.retained90Days}</p>
              <p className="text-xs text-muted-foreground">Retained 90+ days</p>
            </div>
          </div>

          {employments.length === 0 ? (
            <EmptyState title="No participants placed with this employer yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participant</TableHead>
                  <TableHead>Job title</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employments.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/participants/${row.participantProfile.id}`)}
                  >
                    <TableCell className="font-medium">
                      {row.participantProfile.person.firstName}{' '}
                      {row.participantProfile.person.lastName}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {row.participantProfile.participantNumber}
                      </span>
                    </TableCell>
                    <TableCell>{row.jobTitle}</TableCell>
                    <TableCell>{formatDate(row.startDate)}</TableCell>
                    <TableCell>{formatDate(row.endDate)}</TableCell>
                    <TableCell>
                      <EmploymentStatusBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EmployerFormDialog open={editOpen} onOpenChange={setEditOpen} employer={employer} />
      <EmploymentFormDialog
        open={placementOpen}
        onOpenChange={setPlacementOpen}
        presetEmployerId={employer.id}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete employer"
        description={`Delete ${employer.name}? The record is retained for audit but removed from lists.`}
        confirmLabel="Delete employer"
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
