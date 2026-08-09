import { MENTOR_SCREENING_STAGES, mentorScreeningSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterSelect } from '@/components/ui/filter-select';
import { Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { ErrorState, PageLoader } from '@/components/ui/spinner';
import { VolunteerPicker, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, useDebounced } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { type ScreeningListItem } from './types';

const TERMINAL_STAGES = ['approved', 'rejected', 'withdrawn'] as const;
const ACTIVE_STAGES = MENTOR_SCREENING_STAGES.filter(
  (s) => !(TERMINAL_STAGES as readonly string[]).includes(s),
);

interface ScreeningFormValues {
  volunteerProfileId?: string;
  notes?: string;
}

function NewScreeningDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [volunteer, setVolunteer] = useState<PickerOption | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<ScreeningFormValues>({
    resolver: formResolver<ScreeningFormValues>(mentorScreeningSchema),
  });

  const mutation = useMutation({
    mutationFn: (values: ScreeningFormValues) => api.post('/mentoring/screenings', values),
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
          <DialogTitle>Open mentor screening</DialogTitle>
          <DialogDescription>
            Starts the volunteer through the screening pipeline with the default criteria
            checklist.
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
          <FormField
            label="Volunteer"
            required
            error={form.formState.errors.volunteerProfileId}
          >
            <VolunteerPicker
              value={volunteer}
              onChange={(sel) => {
                setVolunteer(sel);
                form.setValue('volunteerProfileId', sel?.id, { shouldValidate: !!sel });
              }}
            />
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

function PipelineCard({ item, onOpen }: { item: ScreeningListItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-md border bg-card p-3 text-left shadow-sm transition-colors hover:bg-accent"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{item.volunteerName}</span>
        {item.isAlumni ? <Badge variant="info">Alumni</Badge> : null}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Criteria {item.criteriaCompleted}/{item.criteriaTotal} · opened{' '}
        {formatDate(item.createdAt)}
      </div>
    </button>
  );
}

export function ScreeningsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [chapter, setChapter] = useState('');
  const [creating, setCreating] = useState(false);
  const [decidedStage, setDecidedStage] = useState<string>('approved');
  const [decidedState, setDecidedState] = useState<ListState>({
    ...initialListState,
    sortBy: 'updatedAt',
    sortDir: 'desc',
  });
  const debounced = useDebounced(search);

  // The pipeline never holds more than a handful of screenings at once, so
  // one page (max 200) is fetched and grouped into stage columns client-side.
  const pipeline = useQuery({
    queryKey: ['mentoring', 'screenings', 'pipeline', chapter, debounced],
    queryFn: () =>
      api.get<Paged<ScreeningListItem>>(
        `/mentoring/screenings${qs({
          pageSize: 200,
          state: chapter || undefined,
          search: debounced,
        })}`,
      ),
  });

  const decided = useQuery({
    queryKey: [
      'mentoring',
      'screenings',
      'decided',
      decidedStage,
      decidedState,
      chapter,
      debounced,
    ],
    queryFn: () =>
      api.get<Paged<ScreeningListItem>>(
        `/mentoring/screenings${qs({
          page: decidedState.page,
          pageSize: decidedState.pageSize,
          sortBy: decidedState.sortBy,
          sortDir: decidedState.sortDir,
          stage: decidedStage,
          state: chapter || undefined,
          search: debounced,
        })}`,
      ),
  });

  const active = (pipeline.data?.items ?? []).filter(
    (s) => !(TERMINAL_STAGES as readonly string[]).includes(s.stage),
  );
  const byStage = new Map<string, ScreeningListItem[]>();
  for (const s of active) {
    const list = byStage.get(s.stage) ?? [];
    list.push(s);
    byStage.set(s.stage, list);
  }

  const decidedColumns: Column<ScreeningListItem>[] = [
    { key: 'volunteer', header: 'Volunteer', render: (s) => s.volunteerName },
    {
      key: 'alumni',
      header: 'Alumni',
      render: (s) => (s.isAlumni ? <Badge variant="info">Alumni</Badge> : '—'),
    },
    { key: 'stage', header: 'Outcome', sortKey: 'stage', render: (s) => <StatusBadge status={s.stage} /> },
    {
      key: 'approvedAt',
      header: 'Approved',
      sortKey: 'approvedAt',
      render: (s) => formatDate(s.approvedAt),
    },
    { key: 'conditions', header: 'Conditions', render: (s) => s.conditions ?? '—' },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortKey: 'updatedAt',
      render: (s) => formatDate(s.updatedAt),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mentor Screenings"
        actions={
          can('mentoring.create') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Open screening
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="Search volunteer name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ChapterFilterSelect
          value={chapter}
          onChange={(value) => {
            setChapter(value);
            setDecidedState((s) => ({ ...s, page: 1 }));
          }}
        />
      </ListToolbar>

      {pipeline.isLoading ? (
        <PageLoader />
      ) : pipeline.isError ? (
        <ErrorState error={pipeline.error} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {ACTIVE_STAGES.map((stage) => {
            const items = byStage.get(stage) ?? [];
            return (
              <div key={stage} className="space-y-2 rounded-lg bg-muted/50 p-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {humanize(stage)}
                  </span>
                  <span className="text-xs font-medium">{items.length}</span>
                </div>
                {items.map((item) => (
                  <PipelineCard
                    key={item.id}
                    item={item}
                    onOpen={() => navigate(item.id)}
                  />
                ))}
                {items.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    None
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeaderRow title="Decided screenings">
          <FilterSelect
            aria-label="Outcome"
            className="w-full sm:w-44"
            value={decidedStage}
            onChange={(value) => {
              setDecidedStage(value);
              setDecidedState((s) => ({ ...s, page: 1 }));
            }}
          >
            {TERMINAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </FilterSelect>
        </CardHeaderRow>
        <CardContent>
          {decided.isError ? (
            <ErrorState error={decided.error} />
          ) : (
            <DataTable
              columns={decidedColumns}
              data={decided.data}
              isLoading={decided.isLoading}
              state={decidedState}
              onStateChange={setDecidedState}
              onRowClick={(row) => navigate(row.id)}
              emptyMessage={`No ${humanize(decidedStage).toLowerCase()} screenings`}
            />
          )}
        </CardContent>
      </Card>

      {creating ? <NewScreeningDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
