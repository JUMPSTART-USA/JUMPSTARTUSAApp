import { CHAPTER_STATES, ENGAGEMENT_TYPES, alumniEngagementSchema } from '@jumpstart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
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
import { FilterSelect } from '@/components/ui/filter-select';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { ErrorState } from '@/components/ui/spinner';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { emptyToUndefined, type EngagementView } from './types';

interface EngagementFormValues {
  participantProfileId?: string;
  engagementType?: string;
  engagementDate?: string;
  notes?: string;
}

function LogEngagementDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<EngagementFormValues>({
    resolver: formResolver<EngagementFormValues>(alumniEngagementSchema),
    defaultValues: { engagementDate: todayInput() },
  });

  const mutation = useMutation({
    mutationFn: (values: EngagementFormValues) => api.post('/alumni-engagements', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mentoring'] });
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent unsavedChanges={form.formState.isDirty}>
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
          <FormError message={topError} />
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
              {mutation.isPending ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EngagementsPage() {
  const { can } = useAuth();
  const { values, draft, set, listState, onListStateChange } = useListParams(
    {
      search: P.text(),
      engagementType: P.choice(ENGAGEMENT_TYPES, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
    { sort: { by: 'engagementDate', dir: 'desc' } },
  );
  const [logging, setLogging] = useState(false);

  const query = useQuery({
    queryKey: ['mentoring', 'engagements', listState, values],
    queryFn: () =>
      api.get<Paged<EngagementView>>(
        `/alumni-engagements${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          engagementType: values.engagementType || undefined,
          state: values.state || undefined,
          // `values`, not `draft`: the query waits for typing to settle.
          search: values.search,
        })}`,
      ),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
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
      <PageHeader
        title="Alumni Engagements"
        actions={
          can('alumni.create') ? (
            <Button onClick={() => setLogging(true)}>
              <Plus className="h-4 w-4" /> Log engagement
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles — and the page reset the old
            useEffect did by hand now happens in the same URL write. */}
        <SearchInput
          placeholder="Search participant or notes…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Engagement type"
          className="w-full sm:w-44"
          value={values.engagementType}
          onChange={(value) => set('engagementType', value as (typeof ENGAGEMENT_TYPES)[number] | '')}
        >
          <option value="">All types</option>
          {ENGAGEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
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
          emptyMessage="No engagements logged"
        />
      )}

      {logging ? <LogEngagementDialog onClose={() => setLogging(false)} /> : null}
    </div>
  );
}
