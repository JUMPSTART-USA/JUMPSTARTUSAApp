import { zodResolver } from '@hookform/resolvers/zod';
import { volunteerTrainingSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { applyApiFormErrors, ErrorNotice, ExpiryBadge, toDateInput } from '../shared';
import type { TrainingRow } from '../types';

interface TrainingFormValues {
  volunteerProfileId: string;
  trainingType: string;
  completedAt: string;
  expiresAt?: string;
  notes?: string;
}

const trainingResolver =
  zodResolver(volunteerTrainingSchema) as unknown as Resolver<TrainingFormValues>;

export function TrainingsTab({ volunteerProfileId }: { volunteerProfileId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [listState, setListState] = useState<ListState>({
    ...initialListState,
    sortBy: 'completedAt',
    sortDir: 'desc',
  });
  const [editing, setEditing] = useState<TrainingRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const params = { ...listState, volunteerProfileId };
  const { data, isLoading, error } = useQuery({
    queryKey: ['volunteers', 'trainings', params],
    queryFn: () => api.get<Paged<TrainingRow>>(`/volunteers/trainings${qs(params)}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/volunteers/trainings/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['volunteers'] }),
  });

  const columns: Column<TrainingRow>[] = [
    {
      key: 'trainingType',
      header: 'Training',
      sortKey: 'trainingType',
      render: (row) => <span className="font-medium">{row.trainingType}</span>,
    },
    {
      key: 'completedAt',
      header: 'Completed',
      sortKey: 'completedAt',
      render: (row) => formatDate(row.completedAt),
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      sortKey: 'expiresAt',
      render: (row) => <ExpiryBadge date={row.expiresAt} />,
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (row) => row.notes ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          {can('volunteers.update') ? (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(row);
                setDialogOpen(true);
              }}
            >
              Edit
            </Button>
          ) : null}
          {can('volunteers.delete') ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete training "${row.trainingType}"? Use only for corrections — the audit log keeps the record.`)) {
                  remove.mutate(row.id);
                }
              }}
            >
              Delete
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        {can('volunteers.create') ? (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Record training
          </Button>
        ) : null}
      </div>

      {error ? <ErrorState error={error} /> : null}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        emptyMessage="No trainings recorded"
      />

      <TrainingDialog
        volunteerProfileId={volunteerProfileId}
        training={editing}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </div>
  );
}

function TrainingDialog({
  volunteerProfileId,
  training,
  open,
  onOpenChange,
}: {
  volunteerProfileId: string;
  training: TrainingRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<TrainingFormValues>({
    resolver: trainingResolver,
    values: {
      volunteerProfileId,
      trainingType: training?.trainingType ?? '',
      completedAt: toDateInput(training?.completedAt) || new Date().toISOString().slice(0, 10),
      expiresAt: toDateInput(training?.expiresAt),
      notes: training?.notes ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (payload: TrainingFormValues) =>
      training
        ? api.patch(`/volunteers/trainings/${training.id}`, payload)
        : api.post('/volunteers/trainings', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setTopError(null);
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiFormErrors(err, form.setError)),
  });

  const onSubmit = form.handleSubmit((data) => {
    setTopError(null);
    save.mutate(data);
  });

  const { register, formState } = form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{training ? 'Edit training' : 'Record training'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Training type" required error={formState.errors.trainingType}>
            <Input
              {...register('trainingType')}
              placeholder="e.g. Orientation, PREA awareness"
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Completed" required error={formState.errors.completedAt}>
              <Input type="date" {...register('completedAt')} />
            </FormField>
            <FormField
              label="Expires"
              error={formState.errors.expiresAt}
              hint="Leave blank if it never expires"
            >
              <Input type="date" {...register('expiresAt')} />
            </FormField>
          </div>
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>

          {topError ? <ErrorNotice>{topError}</ErrorNotice> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : training ? 'Save changes' : 'Record training'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
