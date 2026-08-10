import {
  donorTaskSchema,
  INTERACTION_CHANNELS,
  INTERACTION_CHANNEL_LABELS,
  INTERACTION_PURPOSES,
  INTERACTION_PURPOSE_LABELS,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column, type ListState } from '@/components/DataTable';
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
import { type PickerOption } from '@/components/ui/entity-picker';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { formatDate } from '@/lib/utils';
import { DonorPicker } from '../shared';
import type { DonorTask, NamedRef } from '../types';
import { DonorsNav } from './DonorsNav';
import { BackLink } from '@/components/BackLink';

interface TaskFormValues {
  donorId: string;
  subject: string;
  dueDate?: string;
  channel?: string;
  purpose?: string;
  assignedToId?: string;
  notes?: string;
}

/** Create dialog for donor stewardship tasks. */
export function DonorTaskFormDialog({
  open,
  onOpenChange,
  donorRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Locks the donor picker when opened from a donor profile. */
  donorRef?: NamedRef;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [donor, setDonor] = useState<PickerOption | null>(null);
  const [assignToMe, setAssignToMe] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: formResolver<TaskFormValues>(donorTaskSchema),
  });

  useEffect(() => {
    if (open) {
      reset({ donorId: donorRef?.id ?? '', subject: '', dueDate: '', notes: '' });
      setDonor(donorRef ? { id: donorRef.id, label: donorRef.name } : null);
      setAssignToMe(true);
      setTopError(null);
    }
  }, [open, donorRef, reset]);

  const mutation = useMutation({
    mutationFn: (values: TaskFormValues) =>
      api.post('/donor-tasks', {
        ...values,
        assignedToId: assignToMe ? user?.id : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField label="Donor" required error={errors.donorId}>
            <DonorPicker
              value={donor}
              disabled={Boolean(donorRef)}
              onChange={(d) => {
                setDonor(d);
                setValue('donorId', d?.id ?? '', { shouldValidate: Boolean(d) });
              }}
            />
          </FormField>
          <FormField label="Subject" required error={errors.subject}>
            <Input {...register('subject')} placeholder="e.g. Call to thank for year-end gift" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Due date" error={errors.dueDate}>
              <Input type="date" {...register('dueDate')} />
            </FormField>
            <FormField label="Channel" error={errors.channel}>
              <Select {...register('channel')}>
                <option value="">None</option>
                {INTERACTION_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {INTERACTION_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Purpose" error={errors.purpose}>
              <Select {...register('purpose')}>
                <option value="">None</option>
                {INTERACTION_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {INTERACTION_PURPOSE_LABELS[p]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} />
            Assign to me
          </label>
          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

/** Completes a task, optionally logging the touch as a donor interaction. */
export function CompleteTaskDialog({
  task,
  onOpenChange,
}: {
  task: DonorTask | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [logInteraction, setLogInteraction] = useState(false);
  const [channel, setChannel] = useState('other');
  const [purpose, setPurpose] = useState('other');

  useEffect(() => {
    if (task) {
      setLogInteraction(Boolean(task.channel || task.purpose));
      setChannel(task.channel ?? 'other');
      setPurpose(task.purpose ?? 'other');
      setTopError(null);
    }
  }, [task]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/donor-tasks/${task?.id}`, {
        status: 'completed',
        ...(logInteraction ? { logInteraction: { channel, purpose } } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err)),
  });

  return (
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete task</DialogTitle>
          <DialogDescription>{task?.subject}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={logInteraction}
              onChange={(e) => setLogInteraction(e.target.checked)}
            />
            Log as an interaction on the donor record
          </label>
          {logInteraction ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Channel">
                <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {INTERACTION_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {INTERACTION_CHANNEL_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Purpose">
                <Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  {INTERACTION_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {INTERACTION_PURPOSE_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          ) : null}
          <FormError message={topError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Complete task'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TaskTab = 'mine' | 'open' | 'completed';

export function DonorTasksPage() {
  const { can, user } = useAuth();
  const [tab, setTab] = useState<TaskTab>('mine');
  const [state, setState] = useState<ListState>({
    page: 1,
    pageSize: 25,
    sortBy: 'dueDate',
    sortDir: 'asc',
  });
  const [chapter, setChapter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [completing, setCompleting] = useState<DonorTask | null>(null);
  const canUpdate = can('donors.update');
  const today = todayInput();

  const params = qs({
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    status: tab === 'completed' ? 'completed' : 'open',
    assignedToId: tab === 'mine' ? 'me' : undefined,
    state: chapter,
  });
  const query = useQuery({
    queryKey: ['crm', 'donor-tasks', 'list', params],
    queryFn: () => api.get<Paged<DonorTask>>(`/donor-tasks${params}`),
  });

  const columns = useMemo<Column<DonorTask>[]>(() => {
    const cols: Column<DonorTask>[] = [
      {
        key: 'donor',
        header: 'Donor',
        render: (t) =>
          t.donor ? (
            <Link to={`/donors/${t.donor.id}`} className="font-medium text-primary hover:underline">
              {t.donor.name}
            </Link>
          ) : (
            '—'
          ),
      },
      { key: 'subject', header: 'Subject', sortKey: 'subject', render: (t) => t.subject },
      {
        key: 'dueDate',
        header: 'Due',
        sortKey: 'dueDate',
        render: (t) => {
          const overdue =
            t.status === 'open' && t.dueDate ? t.dueDate.slice(0, 10) < today : false;
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              {formatDate(t.dueDate)}
              {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
            </span>
          );
        },
      },
      {
        key: 'assignedTo',
        header: 'Assigned',
        render: (t) =>
          t.assignedToId === null ? (
            <span className="text-muted-foreground">Unassigned</span>
          ) : t.assignedToId === user?.id ? (
            'Me'
          ) : (
            'Teammate'
          ),
      },
    ];
    if (tab === 'completed') {
      cols.push({
        key: 'completedAt',
        header: 'Completed',
        render: (t) => formatDate(t.completedAt),
      });
    } else if (canUpdate) {
      cols.push({
        key: 'actions',
        header: '',
        className: 'text-right',
        render: (t) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setCompleting(t);
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
          </Button>
        ),
      });
    }
    return cols;
  }, [tab, canUpdate, user?.id, today]);

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Tasks"
        description="Stewardship follow-ups — calls, thank-yous and reminders."
        actions={
          can('donors.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New task
            </Button>
          ) : null
        }
      />

      <DonorsNav />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(next) => {
            setTab(next as TaskTab);
            setState((s) => ({ ...s, page: 1 }));
          }}
        >
          <TabsList>
            <TabsTrigger value="mine">My tasks</TabsTrigger>
            <TabsTrigger value="open">All open</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
        {/* Chapter filter (§7.2) — hidden for scoped users; the API force-filters theirs. */}
        <ChapterFilterSelect
          value={chapter}
          onChange={(value) => {
            setChapter(value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        />
      </div>

      {query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}
      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        state={state}
        onStateChange={setState}
        emptyMessage={tab === 'completed' ? 'No completed tasks' : 'No open tasks'}
      />

      <DonorTaskFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CompleteTaskDialog
        task={completing}
        onOpenChange={(next) => {
          if (!next) setCompleting(null);
        }}
      />
    </div>
  );
}
