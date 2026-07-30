import { zodResolver } from '@hookform/resolvers/zod';
import { maintenanceRecordSchema } from '@jumpstart/shared';
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
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, toDateInput, todayInput } from '@/lib/form';
import type { MaintenanceRecord, VendorOption } from './types';

interface MaintenanceFormValues {
  vehicleId: string;
  maintenanceDate: string;
  maintenanceType: string;
  mileageAtService?: string | number;
  vendorId?: string;
  cost?: string | number;
  description: string;
  nextServiceDueDate: string;
  nextServiceDueMileage?: string | number;
  notes: string;
}

function buildDefaults(vehicleId: string, record?: MaintenanceRecord): MaintenanceFormValues {
  return {
    vehicleId,
    maintenanceDate: record ? toDateInput(record.maintenanceDate) : todayInput(),
    maintenanceType: record?.maintenanceType ?? '',
    mileageAtService: record?.mileageAtService ?? '',
    vendorId: record?.vendorId ?? '',
    cost: record?.cost ?? '',
    description: record?.description ?? '',
    nextServiceDueDate: toDateInput(record?.nextServiceDueDate),
    nextServiceDueMileage: record?.nextServiceDueMileage ?? '',
    notes: record?.notes ?? '',
  };
}

const emptyToUndef = (v: unknown) => (v === '' ? undefined : v);

export function MaintenanceFormDialog({
  open,
  onOpenChange,
  vehicleId,
  record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  /** Edit mode when present, log-maintenance mode otherwise. */
  record?: MaintenanceRecord;
}) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [topError, setTopError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceRecordSchema) as unknown as Resolver<MaintenanceFormValues>,
    defaultValues: buildDefaults(vehicleId, record),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults(vehicleId, record));
      setTopError(null);
    }
  }, [open, vehicleId, record, reset]);

  // Vendor Select needs the vendors module grant — degrade to no dropdown without it.
  const canVendors = can('vendors.read');
  const vendorsQuery = useQuery({
    queryKey: ['fleet', 'vendor-options'],
    queryFn: () =>
      api.get<Paged<VendorOption>>(`/vendors${qs({ pageSize: 200, sortBy: 'name', active: true })}`),
    enabled: open && canVendors,
  });

  const mutation = useMutation({
    mutationFn: (values: MaintenanceFormValues) =>
      record
        ? api.patch<MaintenanceRecord>(`/vehicles/maintenance/${record.id}`, values)
        : api.post<MaintenanceRecord>('/vehicles/maintenance', values),
    onSuccess: () => {
      // A logged service can advance the odometer and reset the alert clock —
      // refresh everything fleet-scoped, not just the history table.
      void queryClient.invalidateQueries({ queryKey: ['fleet'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{record ? 'Edit maintenance record' : 'Log maintenance'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Date" required error={errors.maintenanceDate}>
              <Input type="date" {...register('maintenanceDate')} autoFocus />
            </FormField>
            <FormField label="Type" required error={errors.maintenanceType}>
              <Input {...register('maintenanceType')} placeholder="e.g. Oil change, Tires" />
            </FormField>
            <FormField
              label="Mileage at service"
              error={errors.mileageAtService}
              hint="Advances the vehicle odometer if higher."
            >
              <Input
                type="number"
                min="0"
                {...register('mileageAtService', { setValueAs: emptyToUndef })}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Vendor" error={errors.vendorId}>
              {canVendors ? (
                <Select {...register('vendorId', { setValueAs: emptyToUndef })}>
                  <option value="">None</option>
                  {vendorsQuery.data?.items.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  Vendor lookup requires vendors access
                </p>
              )}
            </FormField>
            <FormField label="Cost" error={errors.cost}>
              <Input
                type="number"
                step="0.01"
                min="0"
                {...register('cost', { setValueAs: emptyToUndef })}
              />
            </FormField>
          </div>

          <FormField label="Description" error={errors.description}>
            <Textarea rows={2} {...register('description')} />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Next service due (date)"
              error={errors.nextServiceDueDate}
              hint="Drives the maintenance-due alert."
            >
              <Input type="date" {...register('nextServiceDueDate')} />
            </FormField>
            <FormField label="Next service due (mileage)" error={errors.nextServiceDueMileage}>
              <Input
                type="number"
                min="0"
                {...register('nextServiceDueMileage', { setValueAs: emptyToUndef })}
              />
            </FormField>
          </div>

          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={2} {...register('notes')} />
          </FormField>

          <FormError message={topError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : record ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
