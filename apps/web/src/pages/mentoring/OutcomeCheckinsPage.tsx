import {
  CHAPTER_STATES,
  CHECKIN_METHODS,
  CHECKIN_WAVES,
  OUTCOME_EMPLOYMENT_STATUSES,
  OUTCOME_HOUSING_STATUSES,
  VERIFICATION_LEVELS,
  outcomeCheckinCompleteSchema,
} from '@jumpstart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { emptyToUndefined, isOverdue, type CheckinView } from './types';

interface CheckinFormValues {
  completedDate: string;
  method?: string;
  employmentStatus?: string;
  housingStatus?: string;
  reArrested?: boolean;
  reArrestedVerification?: string;
  reConvicted?: boolean;
  reConvictedVerification?: string;
  reIncarcerated?: boolean;
  reIncarceratedVerification?: string;
  justiceNotes?: string;
  notes?: string;
}

type JusticeField = 'reArrested' | 'reConvicted' | 'reIncarcerated';
type JusticeVerificationField =
  | 'reArrestedVerification'
  | 'reConvictedVerification'
  | 'reIncarceratedVerification';

/**
 * Three-state justice answer (§9.3): unknown/yes/no maps to undefined/true/
 * false, and answering reveals the per-field verification level.
 */
function JusticeQuestion({
  label,
  field,
  verificationField,
  form,
}: {
  label: string;
  field: JusticeField;
  verificationField: JusticeVerificationField;
  form: UseFormReturn<CheckinFormValues>;
}) {
  const value = form.watch(field);
  const answered = value !== undefined;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FormField label={label}>
        <Select
          value={value === undefined ? '' : value ? 'yes' : 'no'}
          onChange={(e) => {
            const v = e.target.value;
            form.setValue(field, v === '' ? undefined : v === 'yes');
            if (v === '') {
              form.setValue(verificationField, undefined);
              form.clearErrors(verificationField);
            }
          }}
        >
          <option value="">Unknown / not asked</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      </FormField>
      {answered ? (
        <FormField
          label="Verified by"
          required
          error={form.formState.errors[verificationField]}
        >
          <Select {...form.register(verificationField, { setValueAs: emptyToUndefined })}>
            <option value="">Select…</option>
            {VERIFICATION_LEVELS.map((v) => (
              <option key={v} value={v}>
                {humanize(v)}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
    </div>
  );
}

function CompleteCheckinDialog({
  checkin,
  onClose,
}: {
  checkin: CheckinView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<CheckinFormValues>({
    // Client resolver mirrors the API's schema; dates stay strings — the
    // schema coerces on both sides.
    resolver: formResolver<CheckinFormValues>(outcomeCheckinCompleteSchema),
    defaultValues: {
      completedDate: todayInput(),
      method: checkin.method ?? undefined,
      employmentStatus: checkin.employmentStatus ?? undefined,
      housingStatus: checkin.housingStatus ?? undefined,
      reArrested: checkin.reArrested ?? undefined,
      reArrestedVerification: checkin.reArrestedVerification ?? undefined,
      reConvicted: checkin.reConvicted ?? undefined,
      reConvictedVerification: checkin.reConvictedVerification ?? undefined,
      reIncarcerated: checkin.reIncarcerated ?? undefined,
      reIncarceratedVerification: checkin.reIncarceratedVerification ?? undefined,
      justiceNotes: checkin.justiceNotes ?? undefined,
      notes: checkin.notes ?? undefined,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CheckinFormValues) =>
      api.put(`/outcome-checkins/${checkin.id}/complete`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  const person = checkin.participantProfile.person;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent unsavedChanges={form.formState.isDirty} size="xl">
        <DialogHeader>
          <DialogTitle>
            {checkin.completedDate ? 'Revise' : 'Complete'} {humanize(checkin.wave)} check-in
          </DialogTitle>
          <DialogDescription>
            {person.firstName} {person.lastName} · {checkin.participantProfile.participantNumber}{' '}
            · due {formatDate(checkin.dueDate)}
          </DialogDescription>
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
            <FormField label="Completed date" required error={form.formState.errors.completedDate}>
              <Input type="date" {...form.register('completedDate')} />
            </FormField>
            <FormField label="Method" required error={form.formState.errors.method}>
              <Select {...form.register('method', { setValueAs: emptyToUndefined })}>
                <option value="">Select…</option>
                {CHECKIN_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {humanize(m)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Employment" error={form.formState.errors.employmentStatus}>
              <Select {...form.register('employmentStatus', { setValueAs: emptyToUndefined })}>
                <option value="">Not collected</option>
                {OUTCOME_EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Housing" error={form.formState.errors.housingStatus}>
              <Select {...form.register('housingStatus', { setValueAs: emptyToUndefined })}>
                <option value="">Not collected</option>
                {OUTCOME_HOUSING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-semibold">Justice outcomes</p>
            <p className="text-xs text-muted-foreground">
              Each answer records its own verification level (§9.3) — re-arrest may be
              self-reported while re-incarceration is DOC-verified.
            </p>
            <JusticeQuestion
              label="Re-arrested"
              field="reArrested"
              verificationField="reArrestedVerification"
              form={form}
            />
            <JusticeQuestion
              label="Re-convicted"
              field="reConvicted"
              verificationField="reConvictedVerification"
              form={form}
            />
            <JusticeQuestion
              label="Re-incarcerated"
              field="reIncarcerated"
              verificationField="reIncarceratedVerification"
              form={form}
            />
            <FormField label="Justice notes" error={form.formState.errors.justiceNotes}>
              <Textarea rows={2} {...form.register('justiceNotes')} />
            </FormField>
          </div>

          <FormField label="Notes" error={form.formState.errors.notes}>
            <Textarea rows={2} {...form.register('notes')} />
          </FormField>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OutcomeCheckinsPage() {
  const { can } = useAuth();
  const { values, draft, set, listState, onListStateChange } = useListParams(
    {
      search: P.text(),
      /**
       * Defaults to 'overdue' — this screen exists to chase overdue check-ins —
       * so absent means overdue and '' is the explicit "All". A link to the
       * default view carries no `due` key at all.
       */
      due: P.choice(['overdue', 'upcoming'] as const, 'overdue'),
      wave: P.choice(CHECKIN_WAVES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { sort: { by: 'dueDate' } },
  );
  const [completing, setCompleting] = useState<CheckinView | null>(null);

  const query = useQuery({
    queryKey: ['mentoring', 'checkins', listState, values],
    queryFn: () =>
      api.get<Paged<CheckinView>>(
        `/outcome-checkins${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          due: values.due || undefined,
          wave: values.wave || undefined,
          state: values.state || undefined,
          // `values`, not `draft`: the query waits for typing to settle.
          search: values.search,
        })}`,
      ),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const columns: Column<CheckinView>[] = [
    {
      key: 'participant',
      header: 'Participant',
      render: (c) => (
        <span>
          <Link
            to={`/participants/${c.participantProfile.id}`}
            className="font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {c.participantProfile.person.firstName} {c.participantProfile.person.lastName}
          </Link>{' '}
          <span className="text-muted-foreground">
            · {c.participantProfile.participantNumber}
          </span>
        </span>
      ),
    },
    { key: 'wave', header: 'Wave', sortKey: 'wave', render: (c) => humanize(c.wave) },
    {
      key: 'graduated',
      header: 'Graduated',
      render: (c) => formatDate(c.participantProfile.graduationDate),
    },
    {
      key: 'dueDate',
      header: 'Due',
      sortKey: 'dueDate',
      render: (c) =>
        isOverdue(c) ? (
          <span className="font-medium text-destructive">{formatDate(c.dueDate)}</span>
        ) : (
          formatDate(c.dueDate)
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'completedDate',
      render: (c) =>
        c.completedDate ? (
          <span>
            <Badge variant="success">Completed</Badge>{' '}
            <span className="text-muted-foreground">{formatDate(c.completedDate)}</span>
          </span>
        ) : isOverdue(c) ? (
          <Badge variant="destructive">Overdue</Badge>
        ) : (
          <Badge variant="secondary">Upcoming</Badge>
        ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (c) => (c.method ? humanize(c.method) : '—'),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) =>
        can('alumni.update') ? (
          <Button
            size="sm"
            variant={c.completedDate ? 'outline' : 'default'}
            onClick={(e) => {
              e.stopPropagation();
              setCompleting(c);
            }}
          >
            {c.completedDate ? 'Revise' : 'Complete'}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Outcome Check-ins" />

      <ListToolbar>
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles — and the page reset the old
            useEffect did by hand now happens in the same URL write. */}
        <SearchInput
          placeholder="Search participant name or number…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Due status"
          className="w-full sm:w-44"
          value={values.due}
          onChange={(value) => set('due', value as 'overdue' | 'upcoming' | '')}
        >
          <option value="overdue">Overdue</option>
          <option value="upcoming">Upcoming</option>
          <option value="">All</option>
        </FilterSelect>
        <FilterSelect
          aria-label="Wave"
          className="w-full sm:w-44"
          value={values.wave}
          onChange={(value) => set('wave', value as (typeof CHECKIN_WAVES)[number] | '')}
        >
          <option value="">All waves</option>
          {CHECKIN_WAVES.map((w) => (
            <option key={w} value={w}>
              {humanize(w)}
            </option>
          ))}
        </FilterSelect>
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
      </ListToolbar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          state={listState}
          onStateChange={onListStateChange}
          emptyMessage="No check-ins match these filters"
        />
      )}

      {completing ? (
        <CompleteCheckinDialog checkin={completing} onClose={() => setCompleting(null)} />
      ) : null}
    </div>
  );
}
