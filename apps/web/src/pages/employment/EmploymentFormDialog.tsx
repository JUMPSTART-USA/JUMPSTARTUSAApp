import { zodResolver } from '@hookform/resolvers/zod';
import { EMPLOYMENT_STATUSES, employmentSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { FormError } from '@/components/ui/notice';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, toDateInput } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import type { EmployerListItem, EmploymentDetail, EmploymentListItem } from './types';

interface EmploymentFormValues {
  participantProfileId: string;
  employerId: string;
  jobTitle: string;
  startDate: string;
  endDate: string;
  status: string;
  payRate?: string | number;
  payPeriod: string;
  hoursPerWeek?: string | number;
  supervisorName: string;
  supervisorPhone: string;
  notes: string;
}

function buildDefaults(
  employment?: EmploymentListItem,
  presetEmployerId?: string,
): EmploymentFormValues {
  return {
    participantProfileId: employment?.participantProfileId ?? '',
    employerId: employment?.employerId ?? presetEmployerId ?? '',
    jobTitle: employment?.jobTitle ?? '',
    startDate: toDateInput(employment?.startDate),
    endDate: toDateInput(employment?.endDate),
    status: employment?.status ?? 'applied',
    payRate: employment?.payRate ?? '',
    payPeriod: employment?.payPeriod ?? 'hourly',
    hoursPerWeek: employment?.hoursPerWeek ?? '',
    supervisorName: employment?.supervisorName ?? '',
    supervisorPhone: employment?.supervisorPhone ?? '',
    notes: employment?.notes ?? '',
  };
}

const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);

export function EmploymentFormDialog({
  open,
  onOpenChange,
  employment,
  presetEmployerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit / status-change mode when present, new-placement mode otherwise. */
  employment?: EmploymentListItem;
  /** Pre-select the employer when placing from an employer profile. */
  presetEmployerId?: string;
}) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canPay = can('fields.pay.read');
  const [topError, setTopError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<PickerOption | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EmploymentFormValues>({
    resolver: zodResolver(employmentSchema) as unknown as Resolver<EmploymentFormValues>,
    defaultValues: buildDefaults(employment, presetEmployerId),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults(employment, presetEmployerId));
      setParticipant(null);
      setTopError(null);
    }
  }, [open, employment, presetEmployerId, reset]);

  // Employer options for the placement Select (create mode only).
  const employersQuery = useQuery({
    queryKey: ['employers', 'options'],
    queryFn: () =>
      api.get<Paged<EmployerListItem>>(`/employers${qs({ pageSize: 200, sortBy: 'name' })}`),
    enabled: open && !employment,
  });

  // Edit mode: fetch the detail record for its append-only status history.
  const detailQuery = useQuery({
    queryKey: ['employments', 'detail', employment?.id],
    queryFn: () => api.get<EmploymentDetail>(`/employments/${employment!.id}`),
    enabled: open && !!employment,
  });

  const mutation = useMutation({
    mutationFn: (values: EmploymentFormValues) => {
      const payload: Record<string, unknown> = { ...values };
      if (!canPay) {
        // Pay fields are never rendered without fields.pay.read — do not let
        // form defaults silently overwrite the stripped values (§7.2).
        delete payload.payRate;
        delete payload.payPeriod;
        delete payload.hoursPerWeek;
      }
      return employment
        ? api.patch<EmploymentListItem>(`/employments/${employment.id}`, payload)
        : api.post<EmploymentListItem>('/employments', payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employments'] });
      void queryClient.invalidateQueries({ queryKey: ['employers'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{employment ? 'Edit employment' : 'New placement'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          {employment ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Participant">
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {employment.participantProfile.person.firstName}{' '}
                  {employment.participantProfile.person.lastName}{' '}
                  <span className="text-muted-foreground">
                    · {employment.participantProfile.participantNumber}
                  </span>
                </p>
              </FormField>
              <FormField
                label="Employer"
                hint="A job change is a new placement record, not an employer swap (§6.9)."
              >
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {employment.employer.name}
                </p>
              </FormField>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Participant"
                required
                error={
                  errors.participantProfileId ? { message: 'Select a participant' } : undefined
                }
              >
                <ParticipantPicker
                  value={participant}
                  onChange={(option) => {
                    setParticipant(option);
                    setValue('participantProfileId', option?.id ?? '', {
                      shouldValidate: !!option,
                    });
                  }}
                />
              </FormField>
              <FormField
                label="Employer"
                required
                error={errors.employerId ? { message: 'Select an employer' } : undefined}
              >
                <Select {...register('employerId')}>
                  <option value="">Select…</option>
                  {employersQuery.data?.items.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Job title" required error={errors.jobTitle}>
              <Input {...register('jobTitle')} />
            </FormField>
            <FormField label="Status" error={errors.status}>
              <Select {...register('status')}>
                {EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Start date" error={errors.startDate}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" error={errors.endDate}>
              <Input type="date" {...register('endDate')} />
            </FormField>
          </div>

          {canPay ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Pay rate" error={errors.payRate}>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('payRate', { setValueAs: emptyToUndef })}
                />
              </FormField>
              <FormField label="Pay period" error={errors.payPeriod}>
                <Select {...register('payPeriod')}>
                  <option value="hourly">Hourly</option>
                  <option value="weekly">Weekly</option>
                  <option value="annual">Annual</option>
                </Select>
              </FormField>
              <FormField label="Hours / week" error={errors.hoursPerWeek}>
                <Input
                  type="number"
                  min="1"
                  max="168"
                  {...register('hoursPerWeek', { setValueAs: emptyToUndef })}
                />
              </FormField>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Supervisor" error={errors.supervisorName}>
              <Input {...register('supervisorName')} />
            </FormField>
            <FormField label="Supervisor phone" error={errors.supervisorPhone}>
              <Input {...register('supervisorPhone')} />
            </FormField>
          </div>

          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>

          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {employment
              ? 'Status changes are appended to this record’s history — nothing is overwritten. Moving a placement to Active auto-creates 30/60/90-day check-in tasks for the case manager.'
              : 'Hired/Active placements require a start date. When a placement goes Active, 30/60/90-day check-in tasks are created automatically for the participant’s case manager.'}
          </p>

          {employment && detailQuery.data?.statusHistory?.length ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Status history</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {detailQuery.data.statusHistory.map((h) => (
                  <li key={h.id}>
                    {h.fromStatus ? `${humanize(h.fromStatus)} → ` : ''}
                    {humanize(h.toStatus)} · {formatDate(h.effectiveDate)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <FormError message={topError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : employment ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
