import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { needsAssessmentSchema } from '@jumpstart/shared';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
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
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, fullName, humanize } from '@/lib/utils';
import {
  applyFormErrors,
  ParticipantPicker,
  todayStr,
  zodForm,
  type NeedsAssessmentRow,
  type ParticipantRef,
} from './shared';

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
  initialParticipant: ParticipantRef | null;
}) {
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<ParticipantRef | null>(initialParticipant);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState('');

  const { register, handleSubmit, setValue, setError, formState } = useForm<AssessmentFormValues>({
    resolver: zodForm<AssessmentFormValues>(needsAssessmentSchema),
    defaultValues: {
      participantProfileId: initialParticipant?.id ?? '',
      instrumentName: '',
      administeredAt: todayStr(),
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
    onError: (err) => setTopError(applyFormErrors(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Record needs assessment</DialogTitle>
          <DialogDescription>Capture instrument results and domain scores.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError('');
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
          <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3 sm:grid-cols-3">
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
          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Record assessment'}
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortDir: 'desc' });
  const [participant, setParticipant] = useState<ParticipantRef | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<NeedsAssessmentRow | null>(null);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    participantProfileId: participant?.id,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'needs-assessments', params],
    queryFn: () => api.get<Paged<NeedsAssessmentRow>>(`/needs-assessments${params}`),
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
      render: (a) => fullName(a.participantProfile.person),
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
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Needs Assessments</h2>
        {can('case_management.create') ? (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Record assessment
          </Button>
        ) : null}
      </div>

      <div className="w-72">
        <ParticipantPicker
          value={participant}
          onChange={(p) => {
            setParticipant(p);
            setListState((s) => ({ ...s, page: 1 }));
          }}
          placeholder="Filter by participant…"
        />
      </div>

      {error ? <ErrorState error={error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={(a) => setViewing(a)}
        emptyMessage="No needs assessments recorded"
      />

      {dialogOpen ? (
        <RecordAssessmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialParticipant={participant}
        />
      ) : null}
      <AssessmentViewDialog assessment={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
