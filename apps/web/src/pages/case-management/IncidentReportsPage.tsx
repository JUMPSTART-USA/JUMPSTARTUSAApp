import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CHAPTER_STATES,
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABELS,
} from '@jumpstart/shared';
import { backTo } from '@/components/BackLink';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FilterSelect } from '@/components/ui/filter-select';
import { SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/spinner';
import { ListToolbar, ToolbarDateField } from '@/components/ui/toolbar';
import { ParticipantPicker, useParticipantOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form';
import { P, useListParams } from '@/lib/list-params';
import { formatDate, fullName } from '@/lib/utils';
import { IncidentReportFormDialog, type IncidentReportRow } from './incident-report-dialogs';

export type { IncidentReportRow } from './incident-report-dialogs';

export function IncidentReportsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { values, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      participantId: P.id(),
      severity: P.choice(INCIDENT_SEVERITIES, ''),
      status: P.choice(INCIDENT_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
      from: P.date(),
      to: P.date(),
    },
    { sort: { dir: 'desc' } },
  );
  /** The URL carries the id; this turns it back into the name on the chip. */
  const participant = useParticipantOption(values.participantId);
  const [dialogReport, setDialogReport] = useState<IncidentReportRow | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IncidentReportRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canEdit = can('case_management.update');
  const canDelete = can('case_management.delete');
  const canOpenParticipant = can('participants.read');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // The URL value, not the resolved option — see CaseNotesPage.
    participantProfileId: values.participantId,
    severity: values.severity,
    status: values.status,
    state: values.state,
    from: values.from,
    to: values.to,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['case-management', 'incident-reports', params],
    queryFn: () => api.get<Paged<IncidentReportRow>>(`/incident-reports${params}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/incident-reports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      setDeleteTarget(null);
    },
    onError: (err) => setDeleteError(applyApiError(err)),
  });

  const columns: Column<IncidentReportRow>[] = [
    {
      key: 'incidentDate',
      header: 'Date',
      sortKey: 'incidentDate',
      render: (r) => formatDate(r.incidentDate),
      className: 'whitespace-nowrap',
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (r) =>
        canOpenParticipant ? (
          <Link
            to={`/participants/${r.participantProfileId}`}
            {...backTo('/case-management/incidents', 'Incident reports')}
            className="font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fullName(r.participant.person)}
          </Link>
        ) : (
          fullName(r.participant.person)
        ),
    },
    {
      key: 'category',
      header: 'Category',
      sortKey: 'category',
      render: (r) => INCIDENT_CATEGORY_LABELS[r.category],
    },
    {
      key: 'severity',
      header: 'Severity',
      sortKey: 'severity',
      render: (r) => <StatusBadge status={r.severity} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'description',
      header: 'Description',
      render: (r) => <div className="max-w-xs truncate text-muted-foreground">{r.description}</div>,
    },
    ...(canEdit || canDelete
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-20',
            render: (r: IncidentReportRow) => (
              <div className="flex justify-end">
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Edit incident report"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDialogReport(r);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    aria-label="Delete incident report"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteError(null);
                      setDeleteTarget(r);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ),
          } satisfies Column<IncidentReportRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Incident reports"
        actions={
          can('case_management.create') ? (
            <Button onClick={() => setDialogReport('new')}>
              <Plus className="h-4 w-4" /> Report incident
            </Button>
          ) : null
        }
      />

      {/* `set` deletes the page key in the same URL write, so none of these
          filters needs its own page-1 reset any more. */}
      <ListToolbar className="items-end">
        <div className="w-full sm:w-72">
          <ParticipantPicker
            {...participant}
            onChange={(p) => set('participantId', p?.id ?? '')}
          />
        </div>
        <FilterSelect
          aria-label="Severity"
          className="w-full sm:w-44"
          value={values.severity}
          onChange={(value) => set('severity', value as (typeof INCIDENT_SEVERITIES)[number] | '')}
        >
          <option value="">All severities</option>
          {INCIDENT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {INCIDENT_SEVERITY_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof INCIDENT_STATUSES)[number] | '')}
        >
          <option value="">All statuses</option>
          {INCIDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INCIDENT_STATUS_LABELS[s]}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): reports derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
        <ToolbarDateField label="From" value={values.from} onChange={(e) => set('from', e.target.value)} />
        <ToolbarDateField label="To" value={values.to} onChange={(e) => set('to', e.target.value)} />
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      <DataTable chapterScoped
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No incidents reported"
      />

      <IncidentReportFormDialog
        report={dialogReport}
        initialParticipant={participant.value}
        onClose={() => setDialogReport(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        title="Delete incident report"
        description={
          deleteTarget
            ? `Delete the ${formatDate(deleteTarget.incidentDate)} incident report for ${fullName(deleteTarget.participant.person)}?`
            : undefined
        }
        isPending={remove.isPending}
        error={deleteError}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}

/**
 * Compact incident-reports card for the participant profile Case Management
 * tab: the 5 most recent incidents plus a "Report incident" action reusing
 * IncidentReportFormDialog locked to this participant.
 */
export function IncidentReportsCard({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const canCreate = can('case_management.create');
  const [dialogReport, setDialogReport] = useState<IncidentReportRow | 'new' | null>(null);

  const query = useQuery({
    queryKey: ['participants', participantId, 'incident-reports'],
    queryFn: () =>
      api.get<Paged<IncidentReportRow>>(
        `/incident-reports${qs({
          participantProfileId: participantId,
          pageSize: 5,
          sortBy: 'incidentDate',
          sortDir: 'desc',
        })}`,
      ),
  });

  const reports = query.data?.items ?? [];

  return (
    <Card>
      <CardHeaderRow title="Incident reports">
        {canCreate ? (
          <Button variant="outline" size="sm" onClick={() => setDialogReport('new')}>
            <Plus className="h-3.5 w-3.5" /> Report incident
          </Button>
        ) : null}
      </CardHeaderRow>
      <CardContent>
        {query.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : reports.length === 0 ? (
          <EmptyState title="No incidents reported" />
        ) : (
          <ul className="divide-y">
            {reports.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{INCIDENT_CATEGORY_LABELS[r.category]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(r.incidentDate)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={r.severity} />
                  <StatusBadge status={r.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <IncidentReportFormDialog
        report={dialogReport}
        initialParticipant={{ id: participantId, label: '' }}
        onClose={() => setDialogReport(null)}
      />
    </Card>
  );
}
