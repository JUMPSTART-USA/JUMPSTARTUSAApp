import { zodResolver } from '@hookform/resolvers/zod';
import { institutionSchema, US_STATES } from '@jumpstart/shared';
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
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyApiError } from './helpers';
import type { Institution } from './types';

interface InstitutionFormValues {
  name: string;
  institutionType: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  mainPhone: string;
  chaplainName: string;
  chaplainPhone: string;
  chaplainEmail: string;
  primaryContactName: string;
  primaryContactRole: string;
  primaryContactPhone: string;
  primaryContactEmail: string;
  notes: string;
  active: boolean;
}

function buildDefaults(institution?: Institution): InstitutionFormValues {
  return {
    name: institution?.name ?? '',
    institutionType: institution?.institutionType ?? '',
    addressLine1: institution?.addressLine1 ?? '',
    city: institution?.city ?? '',
    state: institution?.state ?? '',
    zip: institution?.zip ?? '',
    mainPhone: institution?.mainPhone ?? '',
    chaplainName: institution?.chaplainName ?? '',
    chaplainPhone: institution?.chaplainPhone ?? '',
    chaplainEmail: institution?.chaplainEmail ?? '',
    primaryContactName: institution?.primaryContactName ?? '',
    primaryContactRole: institution?.primaryContactRole ?? '',
    primaryContactPhone: institution?.primaryContactPhone ?? '',
    primaryContactEmail: institution?.primaryContactEmail ?? '',
    notes: institution?.notes ?? '',
    active: institution?.active ?? true,
  };
}

export function InstitutionFormDialog({
  open,
  onOpenChange,
  institution,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when present, create mode otherwise. */
  institution?: Institution;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InstitutionFormValues>({
    resolver: zodResolver(institutionSchema) as unknown as Resolver<InstitutionFormValues>,
    defaultValues: buildDefaults(institution),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults(institution));
      setTopError(null);
    }
  }, [open, institution, reset]);

  const mutation = useMutation({
    mutationFn: (values: InstitutionFormValues) =>
      institution
        ? api.patch<Institution>(`/institutions/${institution.id}`, values)
        : api.post<Institution>('/institutions', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['institutions'] });
      onOpenChange(false);
    },
    onError: (err) => applyApiError(err, setError, setTopError),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{institution ? 'Edit institution' : 'New institution'}</DialogTitle>
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
            <FormField label="Institution type" error={errors.institutionType}>
              <Input {...register('institutionType')} placeholder="e.g. State prison, work release" />
            </FormField>
            <FormField label="Main phone" error={errors.mainPhone}>
              <Input {...register('mainPhone')} />
            </FormField>
            <FormField label="Address" error={errors.addressLine1} className="sm:col-span-2">
              <Input {...register('addressLine1')} />
            </FormField>
            <FormField label="City" error={errors.city}>
              <Input {...register('city')} />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="State" required error={errors.state}>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-4">
              <p className="text-sm font-medium text-muted-foreground">Chaplain</p>
              <FormField label="Name" error={errors.chaplainName}>
                <Input {...register('chaplainName')} />
              </FormField>
              <FormField label="Phone" error={errors.chaplainPhone}>
                <Input {...register('chaplainPhone')} />
              </FormField>
              <FormField label="Email" error={errors.chaplainEmail}>
                <Input type="email" {...register('chaplainEmail')} />
              </FormField>
            </div>
            <div className="space-y-4">
              <p className="text-sm font-medium text-muted-foreground">Primary contact</p>
              <FormField label="Name" error={errors.primaryContactName}>
                <Input {...register('primaryContactName')} />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Role" error={errors.primaryContactRole}>
                  <Input {...register('primaryContactRole')} />
                </FormField>
                <FormField label="Phone" error={errors.primaryContactPhone}>
                  <Input {...register('primaryContactPhone')} />
                </FormField>
              </div>
              <FormField label="Email" error={errors.primaryContactEmail}>
                <Input type="email" {...register('primaryContactEmail')} />
              </FormField>
            </div>
          </div>

          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...register('active')} />
            Active — currently partnering with JUMPSTART
          </label>

          {topError ? <p className="text-sm text-destructive">{topError}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : institution ? 'Save changes' : 'Create institution'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
