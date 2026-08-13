import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { CHAPTER_STATES, needsAssessmentSchema } from '@jumpstart/shared';
import { backTo } from '@/components/BackLink';
import { EditAssessmentDialog } from './edit-dialogs';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import { ListToolbar } from '@/components/ui/toolbar';
import { ErrorState } from '@/components/ui/spinner';
import { ParticipantPicker, useParticipantOption, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { formatDate, fullName, humanize } from '@/lib/utils';
import { type NeedsAssessmentRow } from './shared';

/** Standard assessment domains (§6.5) — stored as a domainScores record. */
const DOMAINS = [
  'housing',
  'employment',
  'substance_use',
  'mental_health',
  'transportation',
  'life_skills',
] as const;

interface AssessmentFormValues {
  participantProfileId: string;
  instrumentName: string;
  administeredAt: string;
  administeredByName: string;
  summary: string;
}

function RecordAssessmentDialog({
  open,
  onOpenChange,
  initialParticipant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialParticipant: PickerOption | null;
}) {
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<PickerOption | null>(initialParticipant);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, setError, formState } = useForm<AssessmentFormValues>({
    resolver: formResolver<AssessmentFormValues>(needsAssessmentSchema),
    defaultValues: {
      participantProfileId: initialParticipant?.id ?? '',
      instrumentName: '',
      administeredAt: todayInput(),
      administeredByName: '',
      summary: '',
    },
  });

  const create = useMutation({
    mutationFn: (values: AssessmentFormValues) => {
      // Scores live outside RHF: only filled, numeric entries go into the record.
      const domainScores: Record<string, number> = {};
      for (const [domain, raw] of Object.entries(scores)) {
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n)) domainScores[domain] = n;
      }
      return api.post('/needs-assessments', {
        ...values,
        domainScores: Object.keys(domainScores).length > 0 ? domainScores : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Record needs assessment</DialogTitle>
          <DialogDescription>Capture instrument results and domain scores.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError(null);
            create.mutate(values);
          })}
        >
          <FormField label="Participant" required error={formState.errors.participantProfileId}>
            <ParticipantPicker
              value={participant}
              onChange={(p) => {
                setParticipant(p);
                setValue('participantProfileId', p?.id ?? '', { shouldValidate: !!p });
              }}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Instrument" required error={formState.errors.instrumentName}>
              <Input placeholder="e.g. Self-Sufficiency Matrix" {...register('instrumentName')} />
            </FormField>
            <FormField label="Administered on" required error={formState.errors.administeredAt}>
              <Input type="date" {...register('administeredAt')} />
            </FormField>
          </div>
          <FormField label="Administered by" error={formState.errors.administeredByName}>
            <Input {...register('administeredByName')} />
          </FormField>
          <div className="space-y-1.5">
            <Label>Domain scores</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3 sm:grid-cols-3">
              {DOMAINS.map((domain) => (
                <div key={domain} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{humanize(domain)}</Label>
                  <Input
                    type="number"
                    step="any"
                    className="h-8"
                    value={scores[domain] ?? ''}
                    onChange={(e) => setScores((s) => ({ ...s, [domain]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Leave a domain blank if not scored.</p>
          </div>
          <FormField label="Summary" error={formState.errors.summary}>
            <Textarea rows={3} {...register('summary')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssessmentViewDialog({
  assessment,
  onClose,
}: {
  assessment: NeedsAssessmentRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!assessment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {assessment ? (
          <>
            <DialogHeader>
              <DialogTitle>{assessment.instrumentName}</DialogTitle>
              <DialogDescription>
                {fullName(assessment.participantProfile.person)} ·{' '}
                {formatDate(assessment.administeredAt)}
                {assessment.administeredByName ? <> · by {assessment.administeredByName}</> : null}
              </DialogDescription>
            </DialogHeader>
            {assessment.domainScores && Object.keys(assessment.domainScores).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(assessment.domainScores).map(([domain, score]) => (
                  <div key={domain} className="rounded-md border p-2 text-center">
                    <p className="text-xs text-muted-foreground">{humanize(domain)}</p>
                    <p className="text-lg font-semibold">{score}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No domain scores recorded.</p>
            )}
            {assessment.summary ? (
              <p className="whitespace-pre-wrap text-sm">{assessment.summary}</p>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function NeedsAssessmentsPage() {
  const { can } = useAuth();
  const { values, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      participantId: P.id(),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { sort: { dir: 'desc' } },
  );
  /** The URL carries the id; this turns it back into the name on the chip. */
  const participant = useParticipantOption(values.participantId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<NeedsAssessmentRow | null>(null);
  const [editing, setEditing] = useState<NeedsAssessmentRow | null>(null);
  const canEdit = can('case_management.update');
  const canOpenParticipant = can('participants.read');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // The URL value, not the resolved option — see CaseNotesPage.
    participantProfileId: values.participantId,
    state: values.state,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['case-management', 'needs-assessments', params],
    queryFn: () => api.get<Paged<NeedsAssessmentRow>>(`/needs-assessments${params}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const columns: Column<NeedsAssessmentRow>[] = [
    {
      key: 'administeredAt',
      header: 'Date',
      sortKey: 'administeredAt',
      render: (a) => formatDate(a.administeredAt),
      className: 'whitespace-nowrap',
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (a) =>
        canOpenParticipant ? (
          <Link
            to={`/participants/${a.participantProfileId}`}
            {...backTo('/case-management/assessments', 'Assessments')}
            className="font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fullName(a.participantProfile.person)}
          </Link>
        ) : (
          fullName(a.participantProfile.person)
        ),
    },
    {
      key: 'instrumentName',
      header: 'Instrument',
      sortKey: 'instrumentName',
      render: (a) => a.instrumentName,
    },
    {
      key: 'administeredBy',
      header: 'Administered by',
      render: (a) => a.administeredByName ?? '—',
    },
    {
      key: 'scores',
      header: 'Scores',
      render: (a) =>
        a.domainScores && Object.keys(a.domainScores).length > 0
          ? `${Object.keys(a.domainScores).length} domain${Object.keys(a.domainScores).length === 1 ? '' : 's'}`
          : '—',
    },
    {
      key: 'summary',
      header: 'Summary',
      className: 'max-w-sm',
      render: (a) => <span className="line-clamp-2">{a.summary ?? '—'}</span>,
    },
    {
      // Always present, unlike the Edit column below which is gated on canEdit:
      // the row click was the only opener for the assessment detail, so a
      // read-only user with a keyboard could not read an assessment at all.
      key: 'view',
      header: '',
      className: 'w-16 text-right',
      render: (a) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`View ${a.instrumentName} assessment for ${fullName(a.participantProfile.person)}`}
          onClick={(e) => {
            e.stopPropagation();
            setViewing(a);
          }}
        >
          View
        </Button>
      ),
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-10',
            render: (a: NeedsAssessmentRow) => (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Edit assessment"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(a);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ),
          } satisfies Column<NeedsAssessmentRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Needs Assessments"
        actions={
          can('case_management.create') ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Record assessment
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        <div className="w-full sm:w-72">
          <ParticipantPicker
            {...participant}
            onChange={(p) => set('participantId', p?.id ?? '')}
          />
        </div>
        {/* Chapter scoping (§7.2): assessments derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      <DataTable chapterScoped
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowClick={(a) => setViewing(a)}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No needs assessments recorded"
      />

      {dialogOpen ? (
        <RecordAssessmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialParticipant={participant.value}
        />
      ) : null}
      <AssessmentViewDialog assessment={viewing} onClose={() => setViewing(null)} />
      <EditAssessmentDialog assessment={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
