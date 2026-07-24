import { zodResolver } from '@hookform/resolvers/zod';
import { CLASS_STATUSES, insideClassSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { humanize } from '@/lib/utils';
import { applyApiError, toDateInput, useInstitutionOptions } from './helpers';
import type { InsideClassDetail, InsideClassListItem } from './types';

interface InsideClassFormValues {
  institutionId: string;
  name: string;
  classType: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string;
}

type EditableClass = Pick<
  InsideClassListItem | InsideClassDetail,
  'id' | 'institutionId' | 'name' | 'classType' | 'startDate' | 'endDate' | 'status' | 'notes'
>;

function buildDefaults(insideClass?: EditableClass): InsideClassFormValues {
  return {
    institutionId: insideClass?.institutionId ?? '',
    name: insideClass?.name ?? '',
    classType: insideClass?.classType ?? '',
    startDate: toDateInput(insideClass?.startDate),
    endDate: toDateInput(insideClass?.endDate),
    status: insideClass?.status ?? 'planned',
    notes: insideClass?.notes ?? '',
  };
}

export function InsideClassFormDialog({
  open,
  onOpenChange,
  insideClass,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when present, create mode otherwise. */
  insideClass?: EditableClass;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const institutionOptions = useInstitutionOptions();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InsideClassFormValues>({
    resolver: zodResolver(insideClassSchema) as unknown as Resolver<InsideClassFormValues>,
    defaultValues: buildDefaults(insideClass),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults(insideClass));
      setTopError(null);
    }
  }, [open, insideClass, reset]);

  const mutation = useMutation({
    mutationFn: (values: InsideClassFormValues) =>
      insideClass
        ? api.patch<InsideClassListItem>(`/inside-classes/${insideClass.id}`, values)
        : api.post<InsideClassListItem>('/inside-classes', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inside-classes'] });
      onOpenChange(false);
    },
    onError: (err) => applyApiError(err, setError, setTopError),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{insideClass ? 'Edit class' : 'New inside class'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField label="Institution" required error={errors.institutionId}>
            <Select {...register('institutionId')}>
              <option value="">Select institution…</option>
              {institutionOptions.data?.items.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name} ({inst.state})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Class name" required error={errors.name}>
            <Input {...register('name')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Class type" error={errors.classType}>
              <Input {...register('classType')} placeholder="e.g. JUMPSTART curriculum" />
            </FormField>
            <FormField label="Status" error={errors.status}>
              <Select {...register('status')}>
                {CLASS_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Start date" required error={errors.startDate}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" error={errors.endDate}>
              <Input type="date" {...register('endDate')} />
            </FormField>
          </div>
          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>

          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : insideClass ? 'Save changes' : 'Create class'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
