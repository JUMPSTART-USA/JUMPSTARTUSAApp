import { zodResolver } from '@hookform/resolvers/zod';
import { volunteerTrainingSchema } from '@jumpstart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { AttachmentsCard } from '@/components/AttachmentsCard';
import { DataTable, type Column } from '@/components/DataTable';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { ErrorState } from '@/components/ui/spinner';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useListParams } from '@/lib/list-params';
import { useAuth } from '@/lib/auth';
import { applyApiError, toDateInput, todayInput } from '@/lib/form';
import { formatDate } from '@/lib/utils';
import { ExpiryBadge } from '../shared';
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
  /**
   * Namespaced 'trainings': all three volunteer tabs mount on /volunteers/:id, so
   * an un-namespaced ?page= would page whichever tab the user opens next.
   */
  const { listState, onListStateChange } = useListParams(
    {},
    { ns: 'trainings', sort: { by: 'completedAt', dir: 'desc' } },
  );
  const [editing, setEditing] = useState<TrainingRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<TrainingRow | null>(null);
  const [evidenceRow, setEvidenceRow] = useState<TrainingRow | null>(null);

  const params = { ...listState, volunteerProfileId };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['volunteers', 'trainings', params],
    queryFn: () => api.get<Paged<TrainingRow>>(`/volunteers/trainings${qs(params)}`),
    // Keeps the rows on screen through a page change (DataTable dims them).
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/volunteers/trainings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setDeleting(null);
    },
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
          <Button
            variant="ghost"
            size="sm"
            aria-label="View evidence"
            onClick={(e) => {
              e.stopPropagation();
              setEvidenceRow(row);
            }}
          >
            <Paperclip className="h-4 w-4" /> Evidence
          </Button>
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
                remove.reset();
                setDeleting(row);
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
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Record training
          </Button>
        ) : null}
      </div>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
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

      <Dialog
        open={evidenceRow !== null}
        onOpenChange={(next) => {
          if (!next) setEvidenceRow(null);
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Training evidence</DialogTitle>
            <DialogDescription>
              {evidenceRow
                ? `${evidenceRow.trainingType} — completed ${formatDate(evidenceRow.completedAt)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {evidenceRow ? (
            <AttachmentsCard
              compact
              entityType="volunteer_training"
              entityId={evidenceRow.id}
              title="Evidence"
              canUpload={can('volunteers.update')}
              canDelete={can('volunteers.update')}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title="Delete training?"
        description={
          deleting
            ? `Delete training "${deleting.trainingType}"? Use only for corrections — the audit log keeps the record.`
            : undefined
        }
        isPending={remove.isPending}
        error={
          remove.error
            ? remove.error instanceof ApiError
              ? remove.error.message
              : 'Delete failed'
            : null
        }
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
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
      completedAt: toDateInput(training?.completedAt) || todayInput(),
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
    onError: (err) => setTopError(applyApiError(err, form.setError)),
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
          <div className="grid gap-4 sm:grid-cols-2">
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

          <FormError message={topError} />

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : training ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
