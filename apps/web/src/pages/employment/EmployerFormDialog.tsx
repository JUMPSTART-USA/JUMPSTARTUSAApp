import { zodResolver } from '@hookform/resolvers/zod';
import { employerSchema, HIRING_STATUSES, US_STATES } from '@jumpstart/shared';
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
import { applyApiError } from './shared';
import type { Employer } from './types';

interface EmployerFormValues {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  industry: string;
  hiringStatus: string;
  notes: string;
}

function buildDefaults(employer?: Employer): EmployerFormValues {
  return {
    name: employer?.name ?? '',
    contactPerson: employer?.contactPerson ?? '',
    phone: employer?.phone ?? '',
    email: employer?.email ?? '',
    addressLine1: employer?.addressLine1 ?? '',
    city: employer?.city ?? '',
    state: employer?.state ?? '',
    zip: employer?.zip ?? '',
    industry: employer?.industry ?? '',
    hiringStatus: employer?.hiringStatus ?? 'prospect',
    notes: employer?.notes ?? '',
  };
}

export function EmployerFormDialog({
  open,
  onOpenChange,
  employer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when present, create mode otherwise. */
  employer?: Employer;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EmployerFormValues>({
    resolver: zodResolver(employerSchema) as unknown as Resolver<EmployerFormValues>,
    defaultValues: buildDefaults(employer),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults(employer));
      setTopError(null);
    }
  }, [open, employer, reset]);

  const mutation = useMutation({
    mutationFn: (values: EmployerFormValues) =>
      employer
        ? api.patch<Employer>(`/employers/${employer.id}`, values)
        : api.post<Employer>('/employers', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employers'] });
      onOpenChange(false);
    },
    onError: (err) => applyApiError(err, setError, setTopError),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{employer ? 'Edit employer' : 'New employer'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" required error={errors.name} className="sm:col-span-2">
              <Input {...register('name')} autoFocus />
            </FormField>
            <FormField label="Industry" error={errors.industry}>
              <Input {...register('industry')} placeholder="e.g. Manufacturing, Food service" />
            </FormField>
            <FormField label="Hiring status" error={errors.hiringStatus}>
              <Select {...register('hiringStatus')}>
                {HIRING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Contact person" error={errors.contactPerson}>
              <Input {...register('contactPerson')} />
            </FormField>
            <FormField label="Phone" error={errors.phone}>
              <Input {...register('phone')} />
            </FormField>
            <FormField label="Email" error={errors.email} className="sm:col-span-2">
              <Input type="email" {...register('email')} />
            </FormField>
            <FormField label="Address" error={errors.addressLine1} className="sm:col-span-2">
              <Input {...register('addressLine1')} />
            </FormField>
            <FormField label="City" error={errors.city}>
              <Input {...register('city')} />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="State" error={errors.state}>
                {/* state is an optional enum — '' must reach the schema as undefined */}
                <Select {...register('state', { setValueAs: (v) => (v === '' ? undefined : v) })}>
                  <option value="">Select…</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="ZIP" error={errors.zip}>
                <Input {...register('zip')} />
              </FormField>
            </div>
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
              {mutation.isPending ? 'Saving…' : employer ? 'Save changes' : 'Create employer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
