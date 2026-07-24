import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { caseTaskSchema, TASK_STATUSES, type TaskStatus } from '@jumpstart/shared';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
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
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, fullName, humanize } from '@/lib/utils';
import {
  applyFormErrors,
  dateInputValue,
  ParticipantPicker,
  useDebounced,
  zodForm,
  type CaseTaskRow,
  type ParticipantRef,
} from './shared';

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
  const [topError, setTopError] = useState('');
  const [participant, setParticipant] = useState<ParticipantRef | null>(
    task?.participantProfileId && task.participantProfile
      ? { id: task.participantProfileId, name: fullName(task.participantProfile.person) }
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
    resolver: zodForm<TaskFormValues>(caseTaskSchema),
    defaultValues: task
      ? {
          title: task.title,
          details: task.details ?? '',
          assignedToId: task.assignedToId,
          dueDate: dateInputValue(task.dueDate),
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
    onError: (err) => setTopError(applyFormErrors(err, setError)),
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
            setTopError('');
            save.mutate(values);
          })}
        >
          <FormField label="Title" required error={formState.errors.title}>
            <Input autoFocus {...register('title')} />
          </FormField>
          <FormField label="Details" error={formState.errors.details}>
            <Textarea rows={3} {...register('details')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
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
          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : task ? 'Save changes' : 'Create task'}
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
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortBy: 'dueDate' });
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(true);
  const [editing, setEditing] = useState<CaseTaskRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: debouncedSearch,
    status,
    assignedToId: mineOnly ? user?.id : undefined,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['case-management', 'case-tasks', params],
    queryFn: () => api.get<Paged<CaseTaskRow>>(`/case-tasks${params}`),
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tasks</h2>
        {can('case_management.create') ? (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New task
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-64"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        <Select
          className="w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox
            id="tasks-mine"
            checked={mineOnly}
            onChange={(e) => {
              setMineOnly(e.target.checked);
              setListState((s) => ({ ...s, page: 1 }));
            }}
          />
          <Label htmlFor="tasks-mine">My tasks only</Label>
        </div>
      </div>

      {error ? <ErrorState error={error} /> : null}
      {complete.error ? <ErrorState error={complete.error} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        emptyMessage={mineOnly ? 'No tasks assigned to you' : 'No tasks found'}
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
