import { zodResolver } from '@hookform/resolvers/zod';
import { US_STATES, vendorSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { ChapterSelect } from '@/components/ChapterSelect';
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
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PhoneInput } from '@/components/ui/phone-input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form';
import type { Vendor } from '../types';

interface VendorFormValues {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  /** Postal address state — NOT the chapter. */
  state?: string;
  zip?: string;
  /** Chapter (§7.2) — the API stamps scoped users' own chapter. */
  chapterState?: string;
  servicesProvided?: string;
  isReferralPartner: boolean;
  active: boolean;
  notes?: string;
}

export function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor | null;
}) {
  const { can, user } = useAuth();
  const chapter = user?.chapter ?? null;
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorSchema) as unknown as Resolver<VendorFormValues>,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        vendor
          ? {
              name: vendor.name,
              contactPerson: vendor.contactPerson ?? '',
              phone: vendor.phone ?? '',
              email: vendor.email ?? '',
              addressLine1: vendor.addressLine1 ?? '',
              city: vendor.city ?? '',
              state: vendor.state ?? '',
              zip: vendor.zip ?? '',
              chapterState: vendor.chapterState,
              servicesProvided: vendor.servicesProvided ?? '',
              isReferralPartner: vendor.isReferralPartner,
              active: vendor.active,
              notes: vendor.notes ?? '',
            }
          : // Chapter (§7.2): scoped users never see the picker — theirs is preset.
            { name: '', isReferralPartner: false, active: true, chapterState: chapter ?? '' },
      );
      setFormError(null);
      setConfirmDeleteOpen(false);
    }
  }, [open, vendor, chapter]);

  const mutation = useMutation({
    mutationFn: (values: VendorFormValues) =>
      vendor
        ? api.patch<Vendor>(`/vendors/${vendor.id}`, {
            ...values,
            // Clearable fields: blank means "clear" on edit, not "no change".
            contactPerson: values.contactPerson ?? null,
            phone: values.phone ?? null,
            email: values.email ?? null,
            addressLine1: values.addressLine1 ?? null,
            city: values.city ?? null,
            state: values.state ?? null,
            zip: values.zip ?? null,
            servicesProvided: values.servicesProvided ?? null,
            notes: values.notes ?? null,
          })
        : api.post<Vendor>('/vendors', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'vendors'] });
      onOpenChange(false);
    },
    onError: (err) => setFormError(applyApiError(err, form.setError)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/vendors/${vendor?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'vendors'] });
      setConfirmDeleteOpen(false);
      onOpenChange(false);
    },
  });

  const optional = { setValueAs: (v: unknown) => (v === '' ? undefined : v) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent unsavedChanges={form.formState.isDirty}>
        <DialogHeader>
          <DialogTitle>{vendor ? 'Edit vendor' : 'New vendor'}</DialogTitle>
          {vendor ? (
            <DialogDescription>
              Referrals and maintenance records keep their link to this vendor.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <FormField label="Name" required error={form.formState.errors.name}>
            <Input {...form.register('name')} />
          </FormField>
          {/* Chapter (§7.2) — NOT the postal address state below; hidden for
              scoped users, whose chapter is stamped server-side. */}
          <ChapterSelect
            error={form.formState.errors.chapterState}
            {...form.register('chapterState', optional)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Contact person" error={form.formState.errors.contactPerson}>
              <Input {...form.register('contactPerson', optional)} />
            </FormField>
            <FormField label="Phone" error={form.formState.errors.phone}>
              <PhoneInput {...form.register('phone', optional)} />
            </FormField>
          </div>
          <FormField label="Email" error={form.formState.errors.email}>
            <Input type="email" {...form.register('email', optional)} />
          </FormField>
          <FormField label="Address" error={form.formState.errors.addressLine1}>
            <Input {...form.register('addressLine1', optional)} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="City" error={form.formState.errors.city}>
              <Input {...form.register('city', optional)} />
            </FormField>
            <FormField label="State" error={form.formState.errors.state}>
              <Select {...form.register('state', optional)}>
                <option value="">—</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="ZIP" error={form.formState.errors.zip}>
              <Input inputMode="numeric" {...form.register('zip', optional)} />
            </FormField>
          </div>
          <FormField label="Services provided" error={form.formState.errors.servicesProvided}>
            <Textarea rows={2} {...form.register('servicesProvided', optional)} />
          </FormField>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox {...form.register('isReferralPartner')} /> Referral partner
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox {...form.register('active')} /> Active
            </label>
          </div>
          <FormField label="Notes" error={form.formState.errors.notes}>
            <Textarea rows={2} {...form.register('notes', optional)} />
          </FormField>
          <FormError message={formError} />
          <DialogFooter className="justify-between">
            {vendor && can('vendors.delete') ? (
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto text-destructive"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                Delete
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : vendor ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>

        <ConfirmDialog
          open={confirmDeleteOpen}
          onOpenChange={(next) => {
            setConfirmDeleteOpen(next);
            if (!next) deleteMutation.reset();
          }}
          title="Delete vendor?"
          description="Referrals and maintenance records keep their link to this vendor."
          isPending={deleteMutation.isPending}
          error={deleteMutation.isError ? applyApiError(deleteMutation.error) : null}
          onConfirm={() => deleteMutation.mutate()}
        />
      </DialogContent>
    </Dialog>
  );
}
