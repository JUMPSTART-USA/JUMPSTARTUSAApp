import { zodResolver } from '@hookform/resolvers/zod';
import { ENGAGEMENT_TYPES, alumniEngagementSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Link } from 'react-router-dom';
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
import { Input, Select, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { ParticipantPicker, type PickerSelection } from './pickers';
import { applyApiErrors, emptyToUndefined, type EngagementView } from './types';

interface EngagementFormValues {
  participantProfileId?: string;
  engagementType?: string;
  engagementDate?: string;
  notes?: string;
}

function LogEngagementDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<PickerSelection | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<EngagementFormValues>({
    resolver: zodResolver(alumniEngagementSchema) as unknown as Resolver<EngagementFormValues>,
    defaultValues: { engagementDate: new Date().toISOString().slice(0, 10) },
  });

  const mutation = useMutation({
    mutationFn: (values: EngagementFormValues) => api.post('/alumni-engagements', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiErrors(err, (n, e) => form.setError(n as never, e))),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log alumni engagement</DialogTitle>
          <DialogDescription>
            Quick touch-point log — event attendance, check-in calls, testimonies, service.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => {
            setTopError(null);
            mutation.mutate(v);
          })}
        >
          {topError ? <ErrorState error={new Error(topError)} /> : null}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Type" required error={form.formState.errors.engagementType}>
              <Select {...form.register('engagementType', { setValueAs: emptyToUndefined })}>
                <option value="">Select…</option>
                {ENGAGEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Date" required error={form.formState.errors.engagementDate}>
              <Input type="date" {...form.register('engagementDate')} />
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
              {mutation.isPending ? 'Saving…' : 'Log engagement'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EngagementsPage() {
  const { can } = useAuth();
  const [state, setState] = useState<ListState>({
    ...initialListState,
    sortBy: 'engagementDate',
    sortDir: 'desc',
  });
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setState((s) => ({ ...s, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ['mentoring', 'engagements', state, type, debounced],
    queryFn: () =>
      api.get<Paged<EngagementView>>(
        `/alumni-engagements${qs({
          page: state.page,
          pageSize: state.pageSize,
          sortBy: state.sortBy,
          sortDir: state.sortDir,
          engagementType: type || undefined,
          search: debounced,
        })}`,
      ),
  });

  const columns: Column<EngagementView>[] = [
    {
      key: 'participant',
      header: 'Participant',
      render: (e) => (
        <span>
          <Link
            to={`/participants/${e.participantProfile.id}`}
            className="font-medium text-primary hover:underline"
            onClick={(ev) => ev.stopPropagation()}
          >
            {e.participantProfile.person.firstName} {e.participantProfile.person.lastName}
          </Link>{' '}
          <span className="text-muted-foreground">
            · {e.participantProfile.participantNumber}
          </span>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortKey: 'engagementType',
      render: (e) => humanize(e.engagementType),
    },
    {
      key: 'date',
      header: 'Date',
      sortKey: 'engagementDate',
      render: (e) => formatDate(e.engagementDate),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (e) => (
        <span className="block max-w-96 truncate" title={e.notes ?? undefined}>
          {e.notes ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Alumni Engagements</h1>
        {can('alumni.create') ? (
          <Button onClick={() => setLogging(true)}>Log engagement</Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Search participant or notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-48"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All types</option>
          {ENGAGEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
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
          emptyMessage="No engagements logged"
        />
      )}

      {logging ? <LogEngagementDialog onClose={() => setLogging(false)} /> : null}
    </div>
  );
}
