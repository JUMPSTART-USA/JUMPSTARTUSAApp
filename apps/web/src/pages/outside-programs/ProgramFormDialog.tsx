import { outsideProgramSchema, PROGRAM_TYPES } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ChapterSelect } from '@/components/ChapterSelect';
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
import { FormError } from '@/components/ui/notice';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, toDateInput } from '@/lib/form';
import { humanize } from '@/lib/utils';
import { emptyToUndef } from './shared';
import type { OutsideProgram, OutsideProgramStatus, StaffRef } from './types';

interface ProgramFormValues {
  name: string;
  programType: string;
  location?: string;
  state?: string;
  startDate?: string;
  endDate?: string;
  recurringSchedule?: string;
  staffLeadId?: string;
  volunteerLeadName?: string;
  capacity?: number | string;
  status: OutsideProgramStatus;
  notes?: string;
}

function toDefaults(program: OutsideProgram | null): ProgramFormValues {
  return {
    name: program?.name ?? '',
    programType: program?.programType ?? 'life_skills',
    location: program?.location ?? '',
    state: program?.state ?? '',
    startDate: toDateInput(program?.startDate),
    endDate: toDateInput(program?.endDate),
    recurringSchedule: program?.recurringSchedule ?? '',
    staffLeadId: program?.staffLeadId ?? '',
    volunteerLeadName: program?.volunteerLeadName ?? '',
    capacity: program?.capacity ?? '',
    status: program?.status ?? 'active',
    notes: program?.notes ?? '',
  };
}

export function ProgramFormDialog({
  open,
  onOpenChange,
  program,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog edits; otherwise it creates. */
  program: OutsideProgram | null;
}) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canPickStaff = can('admin.users');
  const [topError, setTopError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProgramFormValues>({
    resolver: formResolver<ProgramFormValues>(outsideProgramSchema),
    defaultValues: toDefaults(program),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(program));
      setTopError(null);
    }
  }, [open, program, reset]);

  // Staff lead options come from admin/users — only offered when the user
  // holds admin.users; everyone else sees the current lead read-only.
  const staffOptions = useQuery({
    queryKey: ['outside-programs', 'staff-options'],
    queryFn: () =>
      api.get<Paged<StaffRef>>(`/admin/users${qs({ pageSize: 200, status: 'active' })}`),
    enabled: open && canPickStaff,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (values: ProgramFormValues) =>
      program
        ? api.patch<OutsideProgram>(`/outside-programs/${program.id}`, values)
        : api.post<OutsideProgram>('/outside-programs', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outside-programs'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{program ? 'Edit program' : 'New outside program'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <FormError message={topError} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Name" required error={errors.name} className="sm:col-span-2">
              <Input {...register('name')} autoFocus />
            </FormField>
            <FormField label="Program type" required error={errors.programType}>
              <Select {...register('programType')}>
                {PROGRAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status" error={errors.status}>
              <Select {...register('status')}>
                {(['active', 'inactive', 'completed'] as const).map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Location" error={errors.location}>
              <Input {...register('location')} placeholder="Facility, church, campus…" />
            </FormField>
            {/* Chapter scoping (§7.2): programs belong to a chapter — scoped
                users' programs are stamped server-side. */}
            <ChapterSelect
              error={errors.state}
              {...register('state', { setValueAs: emptyToUndef })}
            />
            <FormField label="Start date" error={errors.startDate}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" error={errors.endDate}>
              <Input type="date" {...register('endDate')} />
            </FormField>
            <FormField
              label="Recurring schedule"
              error={errors.recurringSchedule}
              className="sm:col-span-2"
            >
              <Input {...register('recurringSchedule')} placeholder="e.g. Tuesdays 6–8 pm" />
            </FormField>
            {canPickStaff ? (
              <FormField label="Staff lead" error={errors.staffLeadId}>
                <Select {...register('staffLeadId', { setValueAs: emptyToUndef })}>
                  <option value="">—</option>
                  {staffOptions.data?.items.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField
                label="Staff lead"
                hint="Changing the staff lead requires user-administration access"
              >
                <Input
                  disabled
                  value={
                    program?.staffLead
                      ? `${program.staffLead.firstName} ${program.staffLead.lastName}`
                      : '—'
                  }
                />
              </FormField>
            )}
            <FormField label="Volunteer lead" error={errors.volunteerLeadName}>
              <Input {...register('volunteerLeadName')} />
            </FormField>
            <FormField
              label="Capacity"
              error={errors.capacity as { message?: string } | undefined}
              hint="Capacity warns, never blocks (§6.3)"
            >
              <Input
                type="number"
                min={1}
                {...register('capacity', { setValueAs: emptyToUndef })}
              />
            </FormField>
            <FormField label="Notes" error={errors.notes} className="sm:col-span-2">
              <Textarea rows={3} {...register('notes')} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : program ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
