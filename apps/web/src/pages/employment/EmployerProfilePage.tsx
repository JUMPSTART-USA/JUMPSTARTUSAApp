import { HIRING_STATUSES } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink, backTo } from '@/components/BackLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize, socialHref } from '@/lib/utils';
import { EmployerFormDialog } from './EmployerFormDialog';
import { EmploymentFormDialog } from './EmploymentFormDialog';
import { EmploymentStatusBadge, HiringStatusBadge } from './shared';
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
      <div className="space-y-1">
        <BackLink fallbackTo="/employers" fallbackLabel="Employers" />
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {employer.name}
              <HiringStatusBadge status={employer.hiringStatus} />
            </span>
          }
          description={[employer.industry, employer.city, employer.state]
            .filter(Boolean)
            .join(' · ')}
          actions={
            <>
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
            </>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contact information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DescriptionList>
              <InfoItem label="Contact person">{employer.contactPerson}</InfoItem>
              <InfoItem label="Address">
                {employer.addressLine1 || employer.city || employer.state || employer.zip ? (
                  <>
                    {employer.addressLine1 ? (
                      <span className="block">{employer.addressLine1}</span>
                    ) : null}
                    <span className="block">
                      {[employer.city, employer.state, employer.zip].filter(Boolean).join(', ')}
                    </span>
                  </>
                ) : null}
              </InfoItem>
              <InfoItem label="Phone">{employer.phone}</InfoItem>
              <InfoItem label="Email">{employer.email}</InfoItem>
              <InfoItem label="Website">
                {employer.website ? (
                  // Full URLs only — bare domains stay plain text (socialHref's contract).
                  socialHref(employer.website) ? (
                    <a
                      href={socialHref(employer.website) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      {employer.website}
                    </a>
                  ) : (
                    employer.website
                  )
                ) : null}
              </InfoItem>
            </DescriptionList>
            {employer.notes ? (
              <div className="border-t pt-3">
                <DescriptionList columns={1}>
                  <InfoItem label="Notes">
                    <span className="whitespace-pre-wrap">{employer.notes}</span>
                  </InfoItem>
                </DescriptionList>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3 text-center">
            <StatTile label="Placements" value={outcomes.placements} />
            <StatTile label="Currently active" value={outcomes.currentlyActive} />
            <StatTile label="Retained 90+ days" value={outcomes.retained90Days} />
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
                    className="cursor-pointer transition-colors hover:bg-muted/60"
                    // Click-anywhere is kept, but skips modified clicks and clicks
                    // that started on the name link so cmd-click still opens a tab.
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
                        return;
                      if (
                        (e.target as HTMLElement).closest(
                          'a,button,input,select,textarea,[role="button"]',
                        )
                      )
                        return;
                      navigate(
                        `/participants/${row.participantProfile.id}`,
                        backTo(`/employers/${employer.id}`, 'Employer record'),
                      );
                    }}
                  >
                    <TableCell className="font-medium">
                      {/* Link, not just the row onClick, so keyboard and screen-reader
                          users can open the participant record. */}
                      <Link
                        to={`/participants/${row.participantProfile.id}`}
                        {...backTo(`/employers/${employer.id}`, 'Employer record')}
                        className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {row.participantProfile.person.firstName}{' '}
                        {row.participantProfile.person.lastName}{' '}
                        <span className="font-normal text-muted-foreground">
                          · {row.participantProfile.participantNumber}
                        </span>
                      </Link>
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
        isPending={deleteMutation.isPending}
        error={deleteMutation.error ? deleteMutation.error.message : null}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
