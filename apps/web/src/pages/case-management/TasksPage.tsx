import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { caseTaskSchema, CHAPTER_STATES, TASK_STATUSES, type TaskStatus } from '@jumpstart/shared';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterSelect } from '@/components/ui/filter-select';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { ErrorState } from '@/components/ui/spinner';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { applyApiError, formResolver, toDateInput } from '@/lib/form';
import { formatDate, fullName, humanize } from '@/lib/utils';
import { type CaseTaskRow } from './shared';

interface TaskFormValues {
  title: string;
  details: string;
  assignedToId: string;
  dueDate: string;
  status: TaskStatus;
  participantProfileId?: string;
}

interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
}

function TaskDialog({
  task,
  open,
  onOpenChange,
}: {
  task: CaseTaskRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<PickerOption | null>(
    task?.participantProfileId && task.participantProfile
      ? { id: task.participantProfileId, label: fullName(task.participantProfile.person) }
      : null,
  );

  // Staff roster comes from admin/users, which most case managers cannot read —
  // without it, tasks are assigned to the current user.
  const canPickAssignee = can('admin.users');
  const { data: staff } = useQuery({
    queryKey: ['case-management', 'staff-users'],
    queryFn: () => api.get<Paged<StaffUser>>(`/admin/users${qs({ pageSize: 200, status: 'active' })}`),
    enabled: canPickAssignee,
    staleTime: 5 * 60 * 1000,
  });

  const { register, handleSubmit, setValue, setError, formState } = useForm<TaskFormValues>({
    resolver: formResolver<TaskFormValues>(caseTaskSchema),
    defaultValues: task
      ? {
          title: task.title,
          details: task.details ?? '',
          assignedToId: task.assignedToId,
          dueDate: toDateInput(task.dueDate),
          status: task.status,
          participantProfileId: task.participantProfileId ?? undefined,
        }
      : {
          title: '',
          details: '',
          assignedToId: user?.id ?? '',
          dueDate: '',
          status: 'open',
          participantProfileId: undefined,
        },
  });

  const save = useMutation({
    mutationFn: (values: TaskFormValues) =>
      task ? api.patch(`/case-tasks/${task.id}`, values) : api.post('/case-tasks', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-management'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) => {
            setTopError(null);
            save.mutate(values);
          })}
        >
          <FormField label="Title" required error={formState.errors.title}>
            <Input autoFocus {...register('title')} />
          </FormField>
          <FormField label="Details" error={formState.errors.details}>
            <Textarea rows={3} {...register('details')} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Assigned to" required error={formState.errors.assignedToId}>
              {canPickAssignee && staff ? (
                <Select {...register('assignedToId')}>
                  {staff.items.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  disabled
                  value={
                    task ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : 'Me'
                  }
                />
              )}
            </FormField>
            <FormField label="Due date" error={formState.errors.dueDate}>
              <Input type="date" {...register('dueDate')} />
            </FormField>
          </div>
          {task ? (
            <FormField label="Status" error={formState.errors.status}>
              <Select {...register('status')}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          <FormField label="Participant (optional)" error={formState.errors.participantProfileId}>
            <ParticipantPicker
              value={participant}
              onChange={(p) => {
                setParticipant(p);
                setValue('participantProfileId', p?.id ?? undefined);
              }}
            />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : task ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TasksPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      status: P.choice(TASK_STATUSES, ''),
      state: P.choice(CHAPTER_STATES, ''),
      /**
       * Defaults to TRUE, so the URL carries `mineOnly=0` for the wider view and
       * nothing at all for the default — a link to "my tasks" stays clean, and a
       * link to everyone's is explicit about it.
       */
      mineOnly: P.flag(true),
    },
    { sort: { by: 'dueDate' } },
  );
  const [editing, setEditing] = useState<CaseTaskRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    // `values`, not `draft`: the query waits for typing to settle.
    search: values.search,
    status: values.status,
    state: values.state,
    assignedToId: values.mineOnly ? user?.id : undefined,
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['case-management', 'case-tasks', params],
    queryFn: () => api.get<Paged<CaseTaskRow>>(`/case-tasks${params}`),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/case-tasks/${id}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case-management'] }),
  });

  const canUpdate = can('case_management.update');

  const columns: Column<CaseTaskRow>[] = [
    { key: 'title', header: 'Task', sortKey: 'title', render: (t) => t.title },
    {
      key: 'participant',
      header: 'Participant',
      render: (t) => (t.participantProfile ? fullName(t.participantProfile.person) : '—'),
    },
    {
      key: 'assignedTo',
      header: 'Assigned to',
      render: (t) => `${t.assignedTo.firstName} ${t.assignedTo.lastName}`,
    },
    {
      key: 'dueDate',
      header: 'Due',
      sortKey: 'dueDate',
      render: (t) => formatDate(t.dueDate),
      className: 'whitespace-nowrap',
    },
    { key: 'status', header: 'Status', sortKey: 'status', render: (t) => <StatusBadge status={t.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (t) =>
        canUpdate ? (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {t.status === 'open' || t.status === 'in_progress' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={complete.isPending}
                onClick={() => complete.mutate(t.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Done
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(t);
                setDialogOpen(true);
              }}
              aria-label="Edit task"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Tasks"
        actions={
          can('case_management.create') ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New task
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        {/* `draft` so the box echoes every keystroke; the query reads `values`,
            which lands once typing settles. */}
        <SearchInput
          placeholder="Search tasks…"
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
        />
        <FilterSelect
          aria-label="Status"
          className="w-full sm:w-44"
          value={values.status}
          onChange={(value) => set('status', value as (typeof TASK_STATUSES)[number] | '')}
        >
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): tasks derive their chapter from the linked
            participant (unlinked staff to-dos are chapter-neutral and always
            listed) — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(v) => set('state', v as (typeof CHAPTER_STATES)[number] | '')}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="tasks-mine"
            checked={values.mineOnly}
            onChange={(e) => set('mineOnly', e.target.checked)}
          />
          <Label htmlFor="tasks-mine">My tasks only</Label>
        </div>
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      {complete.error ? <ErrorState error={complete.error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage={values.mineOnly ? 'No tasks assigned to you' : 'No tasks found'}
      />

      {dialogOpen ? (
        <TaskDialog
          key={editing?.id ?? 'new'}
          task={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
    </div>
  );
}
