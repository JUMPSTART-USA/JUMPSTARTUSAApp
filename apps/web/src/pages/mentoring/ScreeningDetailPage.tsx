import {
  CHECKLIST_ITEM_STATUSES,
  MENTOR_SCREENING_STAGES,
  mentorScreeningStepSchema,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardHeaderRow, CardTitle } from '@/components/ui/card';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
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
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { emptyToUndefined, type ScreeningDetail } from './types';

interface StepFormValues {
  stage?: string;
  outcome?: string;
  completedAt?: string;
  notes?: string;
}

function AddStepDialog({
  screeningId,
  currentStage,
  onClose,
}: {
  screeningId: string;
  currentStage: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<StepFormValues>({
    resolver: formResolver<StepFormValues>(mentorScreeningStepSchema),
    defaultValues: {
      stage: currentStage,
      outcome: 'passed',
      completedAt: todayInput(),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: StepFormValues) =>
      api.post(`/mentoring/screenings/${screeningId}/steps`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record screening step</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => {
            setTopError(null);
            mutation.mutate(values);
          })}
        >
          <FormError message={topError} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Stage" required error={form.formState.errors.stage}>
              <Select {...form.register('stage', { setValueAs: emptyToUndefined })}>
                {MENTOR_SCREENING_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Outcome" required error={form.formState.errors.outcome}>
              <Select {...form.register('outcome', { setValueAs: emptyToUndefined })}>
                {(['passed', 'failed', 'waived', 'pending'] as const).map((o) => (
                  <option key={o} value={o}>
                    {humanize(o)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Completed" error={form.formState.errors.completedAt}>
            <Input type="date" {...form.register('completedAt')} />
          </FormField>
          <FormField label="Notes" error={form.formState.errors.notes}>
            <Textarea rows={2} {...form.register('notes')} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Stage move with the §6.7 approval gate: approving asks for conditions. */
function StageAdvanceCard({ screening }: { screening: ScreeningDetail }) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<string>(screening.stage);
  const [conditions, setConditions] = useState(screening.conditions ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: { stage: string; conditions?: string }) =>
      api.patch(`/mentoring/screenings/${screening.id}`, body),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
    },
    onError: (err) => setError(applyApiError(err)),
  });

  const approving = stage === 'approved' && screening.stage !== 'approved';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormError message={error} />
        <div className="flex items-center gap-2">
          <Select
            aria-label="Stage"
            className="w-52"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {MENTOR_SCREENING_STAGES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          <Button
            disabled={stage === screening.stage || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                stage,
                ...(approving && conditions.trim() ? { conditions: conditions.trim() } : {}),
              })
            }
          >
            {mutation.isPending ? 'Saving…' : approving ? 'Approve' : 'Update stage'}
          </Button>
        </div>
        {approving ? (
          <Notice variant="warning">
            <p>
              Approving marks this volunteer as a mentor. Any conditions below are recorded as
              their mentor restrictions (e.g. “outside programs only”).
            </p>
            <Textarea
              rows={2}
              placeholder="Conditions (optional)"
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
            />
          </Notice>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CriterionRow({
  criterion,
  screeningId,
  canUpdate,
}: {
  criterion: ScreeningDetail['criteria'][number];
  screeningId: string;
  canUpdate: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (status: string) => api.patch(`/mentoring/criteria/${criterion.id}`, { status }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['mentoring', 'screening', screeningId] }),
    onError: (err) => setError(applyApiError(err)),
  });

  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-sm">
          {criterion.label}
          {criterion.required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </p>
        {criterion.completedAt ? (
          <p className="text-xs text-muted-foreground">
            Completed {formatDate(criterion.completedAt)}
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      {canUpdate ? (
        <Select
          aria-label={`${criterion.label} status`}
          className="w-40 shrink-0"
          value={criterion.status}
          disabled={mutation.isPending}
          onChange={(e) => mutation.mutate(e.target.value)}
        >
          {CHECKLIST_ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      ) : (
        <StatusBadge status={criterion.status} />
      )}
    </div>
  );
}

export function ScreeningDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [addingStep, setAddingStep] = useState(false);

  const query = useQuery({
    queryKey: ['mentoring', 'screening', id],
    queryFn: () => api.get<ScreeningDetail>(`/mentoring/screenings/${id}`),
    enabled: !!id,
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  const screening = query.data!;

  const requiredIncomplete = screening.criteria.filter(
    (c) => c.required && c.status !== 'completed' && c.status !== 'not_applicable',
  ).length;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <Link to=".." relative="path" className="hover:underline">
          Screenings
        </Link>{' '}
        / detail
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {screening.volunteerName}
            {screening.isAlumni ? <Badge variant="info">Alumni</Badge> : null}
            <StatusBadge status={screening.stage} />
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {can('mentoring.update') ? (
            <StageAdvanceCard screening={screening} />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList>
                <InfoItem label="Opened">{formatDate(screening.createdAt)}</InfoItem>
                <InfoItem label="Approved">{formatDate(screening.approvedAt)}</InfoItem>
                <InfoItem label="Conditions">{screening.conditions ?? undefined}</InfoItem>
                <InfoItem label="Notes">{screening.notes ?? undefined}</InfoItem>
              </DescriptionList>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Criteria checklist
                {requiredIncomplete > 0 ? (
                  <span className="ml-2 text-sm font-normal text-warning">
                    {requiredIncomplete} required remaining
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {screening.criteria.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No criteria — this screening was opened without a template.
                </p>
              ) : (
                screening.criteria.map((c) => (
                  <CriterionRow
                    key={c.id}
                    criterion={c}
                    screeningId={screening.id}
                    canUpdate={can('mentoring.update')}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeaderRow title="Steps log">
            {can('mentoring.update') ? (
              <Button size="sm" variant="outline" onClick={() => setAddingStep(true)}>
                Record step
              </Button>
            ) : null}
          </CardHeaderRow>
          <CardContent>
            {screening.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No steps recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {screening.steps.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{humanize(s.stage)}</TableCell>
                      <TableCell>
                        {s.outcome ? <StatusBadge status={s.outcome} /> : '—'}
                      </TableCell>
                      <TableCell>{formatDate(s.completedAt)}</TableCell>
                      <TableCell className="max-w-56 truncate" title={s.notes ?? undefined}>
                        {s.notes ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {addingStep ? (
        <AddStepDialog
          screeningId={screening.id}
          currentStage={screening.stage}
          onClose={() => setAddingStep(false)}
        />
      ) : null}
    </div>
  );
}
