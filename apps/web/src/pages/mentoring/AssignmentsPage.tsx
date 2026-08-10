import { MENTOR_ASSIGNMENT_STATUSES, mentorAssignmentSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/ui/badge';
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
import { Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { ErrorState } from '@/components/ui/spinner';
import { ParticipantPicker, VolunteerPicker, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, useDebounced } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { type AssignmentView } from './types';

interface ProposeFormValues {
  mentorProfileId?: string;
  participantProfileId?: string;
  startDate?: string;
  matchRationale?: string;
  meetingCadence?: string;
}

function ProposeAssignmentDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mentor, setMentor] = useState<PickerOption | null>(null);
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<ProposeFormValues>({
    resolver: formResolver<ProposeFormValues>(mentorAssignmentSchema),
  });

  const mutation = useMutation({
    // status defaults to 'proposed' via the shared schema — activation is a
    // separate case-manager approval (§6.7 workflow 4).
    mutationFn: (values: ProposeFormValues) => api.post('/mentoring/assignments', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    // 409s (mentor at capacity, open assignment already exists) surface here.
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose match</DialogTitle>
          <DialogDescription>
            The match starts as proposed — the participant&apos;s case manager activates it.
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
          <FormField label="Mentor" required error={form.formState.errors.mentorProfileId}>
            <VolunteerPicker
              mentorsOnly
              value={mentor}
              onChange={(sel) => {
                setMentor(sel);
                form.setValue('mentorProfileId', sel?.id, { shouldValidate: !!sel });
              }}
            />
          </FormField>
          <FormField
            label="Participant"
            required
            error={form.formState.errors.participantProfileId}
          >
            <ParticipantPicker
              value={participant}
              onChange={(sel) => {
                setParticipant(sel);
                form.setValue('participantProfileId', sel?.id, { shouldValidate: !!sel });
              }}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Start date" error={form.formState.errors.startDate}>
              <Input type="date" {...form.register('startDate')} />
            </FormField>
            <FormField label="Meeting cadence" error={form.formState.errors.meetingCadence}>
              <Input placeholder="e.g. weekly" {...form.register('meetingCadence')} />
            </FormField>
          </div>
          <FormField label="Match rationale" error={form.formState.errors.matchRationale}>
            <Textarea rows={2} {...form.register('matchRationale')} />
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

export function AssignmentsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<ListState>({
    ...initialListState,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });
  const [status, setStatus] = useState('');
  const [chapter, setChapter] = useState('');
  const [search, setSearch] = useState('');
  const [proposing, setProposing] = useState(false);
  const debounced = useDebounced(search);

  useEffect(() => {
    setState((s) => (s.page === 1 ? s : { ...s, page: 1 }));
  }, [debounced]);

  const query = useQuery({
    queryKey: ['mentoring', 'assignments', state, status, chapter, debounced],
    queryFn: () =>
      api.get<Paged<AssignmentView>>(
        `/mentoring/assignments${qs({
          page: state.page,
          pageSize: state.pageSize,
          sortBy: state.sortBy,
          sortDir: state.sortDir,
          status: status || undefined,
          state: chapter || undefined,
          search: debounced,
        })}`,
      ),
  });

  const columns: Column<AssignmentView>[] = [
    { key: 'mentor', header: 'Mentor', render: (a) => a.mentorName },
    {
      key: 'participant',
      header: 'Participant',
      render: (a) => (
        <span>
          {a.participantName}{' '}
          <span className="text-muted-foreground">· {a.participantNumber}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', sortKey: 'status', render: (a) => <StatusBadge status={a.status} /> },
    { key: 'startDate', header: 'Started', sortKey: 'startDate', render: (a) => formatDate(a.startDate) },
    { key: 'endDate', header: 'Ended', sortKey: 'endDate', render: (a) => formatDate(a.endDate) },
    {
      key: 'cadence',
      header: 'Cadence',
      render: (a) => a.meetingCadence ?? '—',
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mentor Assignments"
        actions={
          can('mentoring.create') ? (
            <Button onClick={() => setProposing(true)}>
              <Plus className="h-4 w-4" /> Propose match
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="Search mentor or participant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {MENTOR_ASSIGNMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        <ChapterFilterSelect
          value={chapter}
          onChange={(value) => {
            setChapter(value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        />
      </ListToolbar>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          state={state}
          onStateChange={setState}
          onRowClick={(row) => navigate(row.id)}
          emptyMessage="No assignments match these filters"
        />
      )}

      {proposing ? <ProposeAssignmentDialog onClose={() => setProposing(false)} /> : null}
    </div>
  );
}
