import { zodResolver } from '@hookform/resolvers/zod';
import { vehicleSchema } from '@jumpstart/shared';
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
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, toDateInput } from '@/lib/form';
import type { Vehicle } from './types';

interface VehicleFormValues {
  make: string;
  model: string;
  year: string | number;
  color: string;
  licensePlate: string;
  vin: string;
  mileage?: string | number;
  assignedLocation: string;
  active: boolean;
  registrationExpiration: string;
  insuranceExpiration: string;
  notes: string;
}

function buildDefaults(vehicle?: Vehicle): VehicleFormValues {
  return {
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    year: vehicle?.year ?? '',
    color: vehicle?.color ?? '',
    licensePlate: vehicle?.licensePlate ?? '',
    vin: vehicle?.vin ?? '',
    mileage: vehicle?.mileage ?? '',
    assignedLocation: vehicle?.assignedLocation ?? '',
    active: vehicle?.active ?? true,
    registrationExpiration: toDateInput(vehicle?.registrationExpiration),
    insuranceExpiration: toDateInput(vehicle?.insuranceExpiration),
    notes: vehicle?.notes ?? '',
  };
}

const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);

export function VehicleFormDialog({
  open,
  onOpenChange,
  vehicle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when present, create mode otherwise. */
  vehicle?: Vehicle;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema) as unknown as Resolver<VehicleFormValues>,
    defaultValues: buildDefaults(vehicle),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults(vehicle));
      setTopError(null);
    }
  }, [open, vehicle, reset]);

  const mutation = useMutation({
    mutationFn: (values: VehicleFormValues) =>
      vehicle
        ? api.patch<Vehicle>(`/vehicles/${vehicle.id}`, values)
        : api.post<Vehicle>('/vehicles', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fleet'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{vehicle ? 'Edit vehicle' : 'New vehicle'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Make" required error={errors.make}>
              <Input {...register('make')} autoFocus />
            </FormField>
            <FormField label="Model" required error={errors.model}>
              <Input {...register('model')} />
            </FormField>
            <FormField label="Year" required error={errors.year}>
              <Input type="number" {...register('year')} />
            </FormField>
            <FormField label="Color" error={errors.color}>
              <Input {...register('color')} />
            </FormField>
            <FormField label="License plate" error={errors.licensePlate}>
              <Input {...register('licensePlate')} />
            </FormField>
            <FormField label="Mileage" error={errors.mileage}>
              <Input type="number" min="0" {...register('mileage', { setValueAs: emptyToUndef })} />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="VIN" error={errors.vin}>
              <Input {...register('vin')} className="uppercase" />
            </FormField>
            <FormField label="Assigned location" error={errors.assignedLocation}>
              <Input {...register('assignedLocation')} placeholder="e.g. Columbia house" />
            </FormField>
            <FormField label="Registration expires" error={errors.registrationExpiration}>
              <Input type="date" {...register('registrationExpiration')} />
            </FormField>
            <FormField label="Insurance expires" error={errors.insuranceExpiration}>
              <Input type="date" {...register('insuranceExpiration')} />
            </FormField>
          </div>

          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...register('active')} />
            Active — in service (only active vehicles raise alerts)
          </label>

          <FormError message={topError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : vehicle ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
