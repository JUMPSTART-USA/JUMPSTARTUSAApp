import { donorSchema, DONOR_TYPES, US_STATES } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { PhoneInput } from '@/components/ui/phone-input';
import { api } from '@/lib/api';
import { applyApiError, formResolver } from '@/lib/form';
import { fullName, humanize } from '@/lib/utils';
import { PersonSearch, type PersonHit } from '../shared';
import type { Donor, PersonRef } from '../types';

const DONOR_STATUSES = ['active', 'lapsed', 'inactive'] as const;

interface DonorFormValues {
  donorType: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  personId?: string;
  notes: string;
}

function buildDefaults(donor?: Donor): DonorFormValues {
  return {
    donorType: donor?.donorType ?? 'individual',
    name: donor?.name ?? '',
    contactPerson: donor?.contactPerson ?? '',
    phone: donor?.phone ?? '',
    email: donor?.email ?? '',
    addressLine1: donor?.addressLine1 ?? '',
    city: donor?.city ?? '',
    state: donor?.state ?? '',
    zip: donor?.zip ?? '',
    status: donor?.status ?? 'active',
    personId: donor?.personId ?? undefined,
    notes: donor?.notes ?? '',
  };
}

/** Full create + edit form for donor records — the platform owns them (§6.8). */
export function DonorFormDialog({
  open,
  onOpenChange,
  donor,
  person,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when present, create mode otherwise. */
  donor?: Donor;
  /** The currently linked person (edit mode), for the picker chip. */
  person?: PersonRef | null;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [linkedPerson, setLinkedPerson] = useState<PersonHit | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors },
  } = useForm<DonorFormValues>({
    resolver: formResolver<DonorFormValues>(donorSchema),
    defaultValues: buildDefaults(donor),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults(donor));
      setLinkedPerson(
        person ? { personId: person.id, name: fullName(person), source: 'Linked' } : null,
      );
      setTopError(null);
    }
  }, [open, donor, person, reset]);

  const mutation = useMutation({
    mutationFn: (values: DonorFormValues) =>
      donor
        ? api.patch<Donor>(`/donors/${donor.id}`, {
            ...values,
            // Clearable fields: blank means "clear" on edit, not "no change".
            contactPerson: values.contactPerson ?? null,
            phone: values.phone ?? null,
            email: values.email ?? null,
            addressLine1: values.addressLine1 ?? null,
            city: values.city ?? null,
            state: values.state ?? null,
            zip: values.zip ?? null,
            notes: values.notes ?? null,
            personId: values.personId ?? null,
          })
        : api.post<Donor>('/donors', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'donors'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{donor ? 'Edit donor' : 'New donor'}</DialogTitle>
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
            <FormField label="Type" error={errors.donorType}>
              <Select {...register('donorType')}>
                {DONOR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status" error={errors.status}>
              <Select {...register('status')}>
                {DONOR_STATUSES.map((s) => (
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
              <PhoneInput {...register('phone')} />
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
                <Select {...register('state')}>
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

          <FormField
            label="Linked person"
            error={errors.personId}
            hint="Connect this donor to a participant or volunteer record."
          >
            <PersonSearch
              selected={linkedPerson}
              onSelect={(hit) => {
                setLinkedPerson(hit);
                setValue('personId', hit?.personId, { shouldDirty: true });
              }}
            />
          </FormField>

          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>

          <FormError message={topError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : donor ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
