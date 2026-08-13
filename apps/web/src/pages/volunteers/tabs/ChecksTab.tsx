import { zodResolver } from '@hookform/resolvers/zod';
import { BACKGROUND_CHECK_RESULTS, backgroundCheckSchema, type BackgroundCheckResult } from '@jumpstart/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { DataTable, type Column } from '@/components/DataTable';
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
import { FormError } from '@/components/ui/notice';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useListParams } from '@/lib/list-params';
import { useAuth } from '@/lib/auth';
import { applyApiError, toDateInput, todayInput } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { ExpiryBadge } from '../shared';
import type { BackgroundCheckRow } from '../types';

interface CheckFormValues {
  personId: string;
  vendor: string;
  package?: string;
  orderedAt: string;
  completedAt?: string;
  result: BackgroundCheckResult;
  expiresAt?: string;
  notes?: string;
}

const checkResolver = zodResolver(backgroundCheckSchema) as unknown as Resolver<CheckFormValues>;

export function ChecksTab({ personId }: { personId: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canReadResults = can('fields.background_checks.read');
  // API requires BOTH volunteers.create/update AND the field-class permission
  // to write adjudication results (§7.2).
  const canRecord = can('volunteers.create') && canReadResults;
  const canEdit = can('volunteers.update') && canReadResults;

  /**
   * Namespaced 'checks': all three volunteer tabs mount on /volunteers/:id, so
   * an un-namespaced ?page= would page whichever tab the user opens next.
   */
  const { listState, onListStateChange, clear, isFiltered } = useListParams(
    {},
    { ns: 'checks', sort: { by: 'orderedAt', dir: 'desc' } },
  );
  const [editing, setEditing] = useState<BackgroundCheckRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const params = { ...listState, personId };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['volunteers', 'checks', params],
    queryFn: () => api.get<Paged<BackgroundCheckRow>>(`/volunteers/background-checks${qs(params)}`),
    // Keeps the rows on screen through a page change (DataTable dims them).
    placeholderData: keepPreviousData,
  });

  const columns: Column<BackgroundCheckRow>[] = [
    {
      key: 'vendor',
      header: 'Vendor',
      sortKey: 'vendor',
      render: (row) => (
        <div>
          <span className="font-medium">{row.vendor}</span>
          {row.package ? (
            <span className="ml-1 text-xs text-muted-foreground">({row.package})</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'orderedAt',
      header: 'Ordered',
      sortKey: 'orderedAt',
      render: (row) => formatDate(row.orderedAt),
    },
    {
      key: 'completedAt',
      header: 'Completed',
      sortKey: 'completedAt',
      render: (row) => formatDate(row.completedAt),
    },
    {
      key: 'result',
      header: 'Result',
      // §7.2: stripped from the response without the field-class permission.
      render: (row) =>
        row.result ? <StatusBadge status={row.result} /> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      render: (row) =>
        'expiresAt' in row ? (
          <ExpiryBadge date={row.expiresAt} emptyLabel="—" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  if (canEdit) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (row) => (
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
      ),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {canReadResults
            ? 'Adjudication results only — never criminal-history detail (§7.4).'
            : 'You can see that checks exist and their dates; results require the background-check field permission.'}
        </p>
        {canRecord ? (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Record check
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
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No background checks recorded"
      />

      <CheckDialog
        personId={personId}
        check={editing}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </div>
  );
}

function CheckDialog({
  personId,
  check,
  open,
  onOpenChange,
}: {
  personId: string;
  check: BackgroundCheckRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);

  const form = useForm<CheckFormValues>({
    resolver: checkResolver,
    values: {
      personId,
      vendor: check?.vendor ?? '',
      package: check?.package ?? '',
      orderedAt: toDateInput(check?.orderedAt) || todayInput(),
      completedAt: toDateInput(check?.completedAt),
      result: check?.result ?? 'pending',
      expiresAt: toDateInput(check?.expiresAt),
      notes: check?.notes ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (payload: CheckFormValues) =>
      check
        ? api.patch(`/volunteers/background-checks/${check.id}`, payload)
        : api.post('/volunteers/background-checks', payload),
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
      <DialogContent unsavedChanges={form.formState.isDirty}>
        <DialogHeader>
          <DialogTitle>{check ? 'Update background check' : 'Record background check'}</DialogTitle>
          <DialogDescription>
            Record the adjudication result only — never criminal-history detail (§7.4).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Vendor" required error={formState.errors.vendor}>
              <Input {...register('vendor')} placeholder="e.g. Sterling Volunteers" />
            </FormField>
            <FormField label="Package" error={formState.errors.package}>
              <Input {...register('package')} />
            </FormField>
            <FormField label="Ordered" required error={formState.errors.orderedAt}>
              <Input type="date" {...register('orderedAt')} />
            </FormField>
            <FormField label="Completed" error={formState.errors.completedAt}>
              <Input type="date" {...register('completedAt')} />
            </FormField>
            <FormField label="Result" error={formState.errors.result}>
              <Select {...register('result')}>
                {BACKGROUND_CHECK_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {humanize(r)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Expires" error={formState.errors.expiresAt}>
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
              {save.isPending ? 'Saving…' : check ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
