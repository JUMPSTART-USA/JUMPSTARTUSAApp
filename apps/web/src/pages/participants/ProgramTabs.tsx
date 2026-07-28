import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { EmploymentFormDialog } from '@/pages/employment/EmploymentFormDialog';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, formatMoney, humanize } from '@/lib/utils';
import { NoteEditDialog, ServiceEditDialog } from './record-dialogs';
import type {
  CaseNoteRow,
  CaseServiceRow,
  EmploymentRow,
  HousingEnrollmentRow,
  TimelineEventRow,
} from './types';

/**
 * Neither inside-classes nor outside-programs exposes a per-participant
 * enrollment list endpoint — the §6.1 timeline is the read model for a
 * participant's enrollment history, so both tabs derive from one shared fetch.
 */
function useFullTimeline(participantId: string) {
  return useQuery({
    queryKey: ['participants', participantId, 'timeline', 'full'],
    queryFn: () =>
      api.get<Paged<TimelineEventRow>>(
        `/participants/${participantId}/timeline${qs({ page: 1, pageSize: 200 })}`,
      ),
  });
}

function TabShell({
  isLoading,
  error,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  children: React.ReactNode;
}) {
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;
  return <>{children}</>;
}

function NoAccess({ what }: { what: string }) {
  return (
    <EmptyState
      title={`No access to ${what}`}
      hint="Your role does not include permission to view these records."
    />
  );
}

function OverflowNote({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Showing the most recent {shown} of {total} records.
    </p>
  );
}

const clickableRow = 'cursor-pointer transition-colors hover:bg-muted/60';

/** Back-state for deep links out of a participant tab (restores the tab). */
const fromParticipantTab = (participantId: string, tab: string) =>
  backTo(`/participants/${participantId}?tab=${tab}`, 'Participant record');

// ── Inside classes / outside programs (timeline-derived) ────────────────────

function EnrollmentTable({
  events,
  titlePrefix,
  header,
  empty,
  rowHref,
  backState,
}: {
  events: TimelineEventRow[];
  titlePrefix: RegExp;
  header: string;
  empty: string;
  /** Destination for a row click, when the viewer may open the parent. */
  rowHref: (e: TimelineEventRow) => string | null;
  backState: { state: unknown };
}) {
  const navigate = useNavigate();
  if (events.length === 0) return <EmptyState title={empty} />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{header}</TableHead>
          <TableHead>Enrolled</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => {
          const href = rowHref(e);
          return (
            <TableRow
              key={e.entityId}
              className={cn(href && clickableRow)}
              onClick={href ? () => navigate(href, backState) : undefined}
            >
              <TableCell className={cn('font-medium', href && 'text-primary')}>
                {e.title.replace(titlePrefix, '')}
              </TableCell>
              <TableCell>{formatDate(e.date)}</TableCell>
              <TableCell>
                <StatusBadge status={e.detail ?? null} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function InsideClassesTab({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const query = useFullTimeline(participantId);
  const events = (query.data?.items ?? []).filter((e) => e.type === 'inside_enrollment');
  const canOpen = can('inside_classes.read');
  return (
    <TabShell isLoading={query.isLoading} error={query.error}>
      <EnrollmentTable
        events={events}
        titlePrefix={/^Inside class: /}
        header="Class"
        empty="No inside class enrollments"
        rowHref={(e) => (canOpen && e.refId ? `/inside-classes/${e.refId}` : null)}
        backState={fromParticipantTab(participantId, 'inside')}
      />
    </TabShell>
  );
}

export function OutsideProgramsTab({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const query = useFullTimeline(participantId);
  const events = (query.data?.items ?? []).filter((e) => e.type === 'outside_enrollment');
  const canOpen = can('outside_programs.read');
  return (
    <TabShell isLoading={query.isLoading} error={query.error}>
      <EnrollmentTable
        events={events}
        titlePrefix={/^Outside program: /}
        header="Program"
        empty="No outside program enrollments"
        rowHref={(e) => (canOpen && e.refId ? `/outside-programs/${e.refId}` : null)}
        backState={fromParticipantTab(participantId, 'outside')}
      />
    </TabShell>
  );
}

// ── Housing ─────────────────────────────────────────────────────────────────

export function HousingTab({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canRead = can('housing.read');
  const query = useQuery({
    queryKey: ['participants', participantId, 'housing'],
    queryFn: () =>
      api.get<Paged<HousingEnrollmentRow>>(
        `/housing-enrollments${qs({ participantProfileId: participantId, pageSize: 100, sortBy: 'moveInDate', sortDir: 'desc' })}`,
      ),
    enabled: canRead,
  });

  if (!canRead) return <NoAccess what="housing records" />;
  return (
    <TabShell isLoading={query.isLoading} error={query.error}>
      {!query.data || query.data.items.length === 0 ? (
        <EmptyState title="No housing enrollments" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Home</TableHead>
                <TableHead>Move in</TableHead>
                <TableHead>Move out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Reason for leaving</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((h) => (
                <TableRow
                  key={h.id}
                  className={clickableRow}
                  onClick={() =>
                    navigate(`/housing/homes/${h.home.id}`, fromParticipantTab(participantId, 'housing'))
                  }
                >
                  <TableCell className="font-medium text-primary">
                    {h.home.name}{' '}
                    <span className="text-xs text-muted-foreground">({h.home.state})</span>
                  </TableCell>
                  <TableCell>{formatDate(h.moveInDate)}</TableCell>
                  <TableCell>{formatDate(h.moveOutDate)}</TableCell>
                  <TableCell>
                    <StatusBadge status={h.status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={h.completionAssessment} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {h.reasonForLeaving ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <OverflowNote shown={query.data.items.length} total={query.data.total} />
        </>
      )}
    </TabShell>
  );
}

// ── Employment ──────────────────────────────────────────────────────────────

export function EmploymentTab({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canRead = can('employment.read');
  // §7.2: pay columns render only for fields.pay.read holders — the API
  // strips the values for everyone else anyway.
  const canPay = can('fields.pay.read');
  const canEdit = can('employment.update');
  const canOpenEmployer = can('employers.read');
  const [editRow, setEditRow] = useState<EmploymentRow | null>(null);
  const query = useQuery({
    queryKey: ['participants', participantId, 'employment'],
    queryFn: () =>
      api.get<Paged<EmploymentRow>>(
        `/employments${qs({ participantProfileId: participantId, pageSize: 100 })}`,
      ),
    enabled: canRead,
  });

  if (!canRead) return <NoAccess what="employment records" />;
  return (
    <TabShell isLoading={query.isLoading} error={query.error}>
      {!query.data || query.data.items.length === 0 ? (
        <EmptyState title="No employment records" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employer</TableHead>
                <TableHead>Job title</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                {canPay ? <TableHead>Pay</TableHead> : null}
                {canPay ? <TableHead>Hrs/wk</TableHead> : null}
                {canEdit ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((e) => (
                <TableRow
                  key={e.id}
                  className={cn(canOpenEmployer && clickableRow)}
                  onClick={
                    canOpenEmployer
                      ? () =>
                          navigate(
                            `/employers/${e.employer.id}`,
                            fromParticipantTab(participantId, 'employment'),
                          )
                      : undefined
                  }
                >
                  <TableCell
                    className={cn('font-medium', canOpenEmployer && 'text-primary')}
                  >
                    {e.employer.name}
                  </TableCell>
                  <TableCell>{e.jobTitle}</TableCell>
                  <TableCell>{formatDate(e.startDate)}</TableCell>
                  <TableCell>{formatDate(e.endDate)}</TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                  {canPay ? (
                    <TableCell>
                      {e.payRate != null ? (
                        <span>
                          {formatMoney(e.payRate)}
                          {e.payPeriod ? (
                            <span className="text-xs text-muted-foreground"> /{e.payPeriod}</span>
                          ) : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  ) : null}
                  {canPay ? <TableCell>{e.hoursPerWeek ?? '—'}</TableCell> : null}
                  {canEdit ? (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Edit employment record"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEditRow(e);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <OverflowNote shown={query.data.items.length} total={query.data.total} />
        </>
      )}
      {canEdit ? (
        <EmploymentFormDialog
          open={editRow !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditRow(null);
              // The dialog invalidates the employment area's keys; refresh
              // this tab's participant-scoped copy too.
              void queryClient.invalidateQueries({
                queryKey: ['participants', participantId, 'employment'],
              });
            }
          }}
          employment={editRow ?? undefined}
        />
      ) : null}
    </TabShell>
  );
}

// ── Case services ───────────────────────────────────────────────────────────

export function ServicesTab({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const canRead = can('case_management.read');
  const canEdit = can('case_management.update');
  const canCreate = can('case_management.create');
  const [editService, setEditService] = useState<CaseServiceRow | 'new' | null>(null);
  const query = useQuery({
    queryKey: ['participants', participantId, 'case-services'],
    queryFn: () =>
      api.get<Paged<CaseServiceRow>>(
        `/case-services${qs({ participantProfileId: participantId, pageSize: 100 })}`,
      ),
    enabled: canRead,
  });

  if (!canRead) return <NoAccess what="case services" />;
  return (
    <TabShell isLoading={query.isLoading} error={query.error}>
      {canCreate ? (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setEditService('new')}>
            <Plus className="h-4 w-4" /> Record service
          </Button>
        </div>
      ) : null}
      {!query.data || query.data.items.length === 0 ? (
        <EmptyState title="No services recorded" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Follow-up</TableHead>
                {canEdit ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((s) => (
                <TableRow
                  key={s.id}
                  className={cn(canEdit && clickableRow)}
                  onClick={canEdit ? () => setEditService(s) : undefined}
                >
                  <TableCell>{formatDate(s.serviceDate)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{s.serviceType}</div>
                    {s.description ? (
                      <div className="max-w-md truncate text-xs text-muted-foreground">
                        {s.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{s.providerName ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{s.outcome ?? '—'}</TableCell>
                  <TableCell>
                    {s.followUpRequired ? formatDate(s.followUpDate) : '—'}
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Edit service"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEditService(s);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <OverflowNote shown={query.data.items.length} total={query.data.total} />
        </>
      )}
      <ServiceEditDialog
        service={editService}
        participantId={participantId}
        onClose={() => setEditService(null)}
      />
    </TabShell>
  );
}

// ── Case notes ──────────────────────────────────────────────────────────────

export function NotesTab({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const canRead = can('case_management.read');
  const canEdit = can('case_management.update');
  const canCreate = can('case_management.create');
  const [editNote, setEditNote] = useState<CaseNoteRow | 'new' | null>(null);
  const query = useQuery({
    queryKey: ['participants', participantId, 'case-notes'],
    queryFn: () =>
      api.get<Paged<CaseNoteRow>>(
        `/case-notes${qs({ participantProfileId: participantId, pageSize: 50 })}`,
      ),
    enabled: canRead,
  });

  if (!canRead) return <NoAccess what="case notes" />;
  return (
    <TabShell isLoading={query.isLoading} error={query.error}>
      {canCreate ? (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setEditNote('new')}>
            <Plus className="h-4 w-4" /> Add note
          </Button>
        </div>
      ) : null}
      {!query.data || query.data.items.length === 0 ? (
        <EmptyState title="No case notes" />
      ) : (
        <div className="space-y-3">
          {query.data.items.map((n) => {
            // §7.3: unauthorized viewers receive a dated stub — render it
            // as-is, with no edit affordance (there is nothing to edit).
            const isStub = n.confidential && n.content === '[Confidential note]';
            return (
              <Card key={n.id}>
                <CardContent className="pt-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{formatDate(n.noteDate)}</span>
                    <Badge variant="secondary">{humanize(n.category)}</Badge>
                    {n.contactType ? <span>{humanize(n.contactType)}</span> : null}
                    <span>· {n.caseManagerName}</span>
                    {n.confidential ? (
                      <Badge variant="warning">
                        <Lock className="mr-1 h-3 w-3" /> Confidential
                      </Badge>
                    ) : null}
                    {n.followUpRequired && n.followUpDate ? (
                      <span>Follow-up {formatDate(n.followUpDate)}</span>
                    ) : null}
                    {canEdit && !isStub ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 px-2"
                        aria-label="Edit note"
                        onClick={() => setEditNote(n)}
                      >
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
                    ) : null}
                  </div>
                  <p
                    className={
                      isStub
                        ? 'text-sm italic text-muted-foreground'
                        : 'whitespace-pre-wrap text-sm'
                    }
                  >
                    {n.content}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          <OverflowNote shown={query.data.items.length} total={query.data.total} />
        </div>
      )}
      <NoteEditDialog
        note={editNote}
        participantId={participantId}
        onClose={() => setEditNote(null)}
      />
    </TabShell>
  );
}
