import { zodResolver } from '@hookform/resolvers/zod';
import { MENTOR_ASSIGNMENT_STATUSES, mentorAssignmentSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
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
import { Input, Select, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { ParticipantPicker, VolunteerPicker, type PickerSelection } from './pickers';
import { applyApiErrors, type AssignmentView } from './types';

interface ProposeFormValues {
  mentorProfileId?: string;
  participantProfileId?: string;
  startDate?: string;
  matchRationale?: string;
  meetingCadence?: string;
}

function ProposeAssignmentDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mentor, setMentor] = useState<PickerSelection | null>(null);
  const [participant, setParticipant] = useState<PickerSelection | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<ProposeFormValues>({
    resolver: zodResolver(mentorAssignmentSchema) as unknown as Resolver<ProposeFormValues>,
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
    onError: (err) => setTopError(applyApiErrors(err, (n, e) => form.setError(n as never, e))),
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
          {topError ? <ErrorState error={new Error(topError)} /> : null}
          <FormField label="Mentor" required error={form.formState.errors.mentorProfileId}>
            <VolunteerPicker
              mentorsOnly
              selection={mentor}
              onSelect={(sel) => {
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
              selection={participant}
              onSelect={(sel) => {
                setParticipant(sel);
                form.setValue('participantProfileId', sel?.id, { shouldValidate: !!sel });
              }}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
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
              {mutation.isPending ? 'Proposing…' : 'Propose match'}
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
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [proposing, setProposing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setState((s) => ({ ...s, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ['mentoring', 'assignments', state, status, debounced],
    queryFn: () =>
      api.get<Paged<AssignmentView>>(
        `/mentoring/assignments${qs({
          page: state.page,
          pageSize: state.pageSize,
          sortBy: state.sortBy,
          sortDir: state.sortDir,
          status: status || undefined,
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mentor Assignments</h1>
        {can('mentoring.create') ? (
          <Button onClick={() => setProposing(true)}>Propose match</Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Search mentor or participant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-40"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {MENTOR_ASSIGNMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} />
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
