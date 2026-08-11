import { classCloseOutSchema, FINAL_ASSESSMENTS, type ClassStatus } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUnsavedNavigationGuard } from '@/components/ui/unsaved-navigation';
import { api } from '@/lib/api';
import { applyApiError, formResolver, toDateInput } from '@/lib/form';
import { formatDate, fullName, humanize } from '@/lib/utils';
import type { InsideClassDetail } from './types';
import { BackLink } from '@/components/BackLink';

/** Statuses a close-out row may take (from closeOutRowSchema). */
const CLOSE_OUT_STATUSES = [
  'completed',
  'assessment_pending',
  'left_early',
  'removed',
  'transferred',
] as const;

interface CloseOutRowValues {
  enrollmentId: string;
  status: string;
  completionDate: string;
  leftEarlyDate: string;
  leftEarlyReason: string;
  finalAssessment: string;
  assessmentNotes: string;
}

interface CloseOutFormValues {
  rows: CloseOutRowValues[];
}

interface CloseOutResult {
  rows: unknown[];
  classStatus: ClassStatus;
  openEnrollments: number;
}

function CloseOutForm({ insideClass }: { insideClass: InsideClassDetail }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [topError, setTopError] = useState<string | null>(null);
  const [result, setResult] = useState<CloseOutResult | null>(null);

  const defaultRows: CloseOutRowValues[] = insideClass.enrollments.map((enrollment) => ({
    enrollmentId: enrollment.id,
    // Rows still enrolled/active default to completed; already-exited rows keep their status.
    status: (CLOSE_OUT_STATUSES as readonly string[]).includes(enrollment.completionStatus)
      ? enrollment.completionStatus
      : 'completed',
    completionDate:
      toDateInput(enrollment.completionDate) || toDateInput(insideClass.endDate) || '',
    leftEarlyDate: toDateInput(enrollment.leftEarlyDate),
    leftEarlyReason: enrollment.leftEarlyReason ?? '',
    finalAssessment: enrollment.finalAssessment ?? '',
    assessmentNotes: enrollment.assessmentNotes ?? '',
  }));

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isDirty },
  } = useForm<CloseOutFormValues>({
    // formResolver's '' → undefined cleaning normalizes the "None yet"
    // assessment select before the shared schema's enum sees it.
    resolver: formResolver<CloseOutFormValues>(classCloseOutSchema),
    defaultValues: { rows: defaultRows },
  });

  const rowValues = watch('rows');

  // A close-out carries one assessment per enrolled student; leaving mid-way
  // throws away the whole set.
  const guard = useUnsavedNavigationGuard(isDirty);

  const mutation = useMutation({
    mutationFn: (values: CloseOutFormValues) =>
      api.post<CloseOutResult>(`/inside-classes/${insideClass.id}/close-out`, values),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['inside-classes'] });
      // Saved. The form is replaced by the summary below, but this hook outlives
      // it, so release the guard or "Back to class" offers to discard the work
      // the server already has.
      guard.allowNavigation();
      setResult(res);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  if (result) {
    const completed = result.classStatus === 'completed';
    return (
      <Card>
        <CardHeader>
          <CardTitle>Close-out saved</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {result.rows.length} enrollment{result.rows.length === 1 ? '' : 's'} updated.
          </p>
          {completed ? (
            <Notice variant="success">
              Every enrollment is closed — the class is now marked Completed.
            </Notice>
          ) : (
            <Notice variant="warning">
              {result.openEnrollments} enrollment{result.openEnrollments === 1 ? '' : 's'} still
              open (including assessment pending) — the class stays{' '}
              {humanize(result.classStatus)} until every assessment is in.
            </Notice>
          )}
          <div className="flex justify-end">
            <Button onClick={() => navigate(`/inside-classes/${insideClass.id}`)}>
              Back to class
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form
      {...guard.formProps}
      onSubmit={handleSubmit((values) => {
        setTopError(null);
        mutation.mutate(values);
      })}
      className="space-y-4"
      noValidate
    >
      <Notice variant="warning">
        Completed rows require a Blue/Green/Yellow/Red assessment — use{' '}
        <span className="font-medium">Assessment pending</span> while assessments are still coming
        in. Left-early rows require both a date and a reason. The class flips to Completed only
        once every row is terminal.
      </Notice>

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Participant</TableHead>
              <TableHead className="min-w-40">Status</TableHead>
              <TableHead className="min-w-36">Completion date</TableHead>
              <TableHead className="min-w-36">Left date</TableHead>
              <TableHead className="min-w-44">Left reason</TableHead>
              <TableHead className="min-w-36">Assessment</TableHead>
              <TableHead className="min-w-48">Assessment notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {insideClass.enrollments.map((enrollment, index) => {
              const rowErrors = errors.rows?.[index];
              const status = rowValues?.[index]?.status;
              return (
                <TableRow key={enrollment.id}>
                  <TableCell>
                    <input type="hidden" {...register(`rows.${index}.enrollmentId`)} />
                    <p className="font-medium">{fullName(enrollment.participantProfile.person)}</p>
                    <p className="text-xs text-muted-foreground">
                      Enrolled {formatDate(enrollment.enrollmentDate)}
                    </p>
                    <StatusBadge status={enrollment.completionStatus} />
                  </TableCell>
                  <TableCell className="align-top">
                    <Select
                      aria-label="Completion status"
                      className="h-8"
                      {...register(`rows.${index}.status`)}
                    >
                      {CLOSE_OUT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {humanize(s)}
                        </option>
                      ))}
                    </Select>
                    {rowErrors?.status?.message ? (
                      <p className="mt-1 text-xs text-destructive">{rowErrors.status.message}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <Input type="date" className="h-8" {...register(`rows.${index}.completionDate`)} />
                    {rowErrors?.completionDate?.message ? (
                      <p className="mt-1 text-xs text-destructive">
                        {rowErrors.completionDate.message}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      type="date"
                      className="h-8"
                      disabled={status !== 'left_early'}
                      {...register(`rows.${index}.leftEarlyDate`)}
                    />
                    {rowErrors?.leftEarlyDate?.message ? (
                      <p className="mt-1 text-xs text-destructive">
                        {rowErrors.leftEarlyDate.message}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <Input
                      className="h-8"
                      disabled={status !== 'left_early'}
                      placeholder={status === 'left_early' ? 'Required' : ''}
                      {...register(`rows.${index}.leftEarlyReason`)}
                    />
                    {rowErrors?.leftEarlyReason?.message ? (
                      <p className="mt-1 text-xs text-destructive">
                        {rowErrors.leftEarlyReason.message}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <Select
                      aria-label="Final assessment"
                      className="h-8"
                      {...register(`rows.${index}.finalAssessment`)}
                    >
                      <option value="">None yet</option>
                      {FINAL_ASSESSMENTS.map((a) => (
                        <option key={a} value={a}>
                          {humanize(a)}
                        </option>
                      ))}
                    </Select>
                    {rowErrors?.finalAssessment?.message ? (
                      <p className="mt-1 text-xs text-destructive">
                        {rowErrors.finalAssessment.message}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      rows={1}
                      className="min-h-8"
                      {...register(`rows.${index}.assessmentNotes`)}
                    />
                    {rowErrors?.assessmentNotes?.message ? (
                      <p className="mt-1 text-xs text-destructive">
                        {rowErrors.assessmentNotes.message}
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <FormError message={topError} />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(`/inside-classes/${insideClass.id}`)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {guard.prompt}
    </form>
  );
}

/** §6.2 close-out workflow: one roster grid, one submit — not a form per participant. */
export function InsideClassCloseOutPage() {
  const { id = '' } = useParams();

  const query = useQuery({
    queryKey: ['inside-classes', id],
    queryFn: () => api.get<InsideClassDetail>(`/inside-classes/${id}`),
    enabled: !!id,
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!query.data) return null;

  const insideClass = query.data;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <BackLink fallbackTo={`/inside-classes/${insideClass.id}`} fallbackLabel={insideClass.name} />
        <PageHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              Close out class
              <StatusBadge status={insideClass.status} />
            </span>
          }
          description={`${insideClass.institution.name} · ${formatDate(insideClass.startDate)} – ${formatDate(insideClass.endDate)}`}
        />
      </div>

      {insideClass.status === 'canceled' ? (
        <ErrorState error={new Error('A canceled class cannot be closed out')} />
      ) : insideClass.enrollments.length === 0 ? (
        <EmptyState title="No enrollments to close out" />
      ) : (
        <CloseOutForm insideClass={insideClass} />
      )}
    </div>
  );
}
