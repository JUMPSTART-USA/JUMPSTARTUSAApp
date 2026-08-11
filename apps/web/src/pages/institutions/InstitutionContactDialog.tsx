import { institutionContactSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PhoneInput } from '@/components/ui/phone-input';
import { api } from '@/lib/api';
import { applyApiError, formResolver } from '@/lib/form';
import type { InstitutionContactRow } from './types';

/** Common designations offered as suggestions — any free text is accepted. */
const ROLE_SUGGESTIONS = [
  'Chaplain',
  'Warden',
  'Assistant Warden',
  'Program Coordinator',
  'Release Coordinator',
  'Volunteer Coordinator',
  'Reentry Coordinator',
  'Records',
  'Mailroom',
];

interface ContactFormValues {
  name: string;
  role: string;
  phone: string;
  email: string;
  notes: string;
}

function contactDefaults(existing: InstitutionContactRow | null): ContactFormValues {
  return {
    name: existing?.name ?? '',
    role: existing?.role ?? '',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    notes: existing?.notes ?? '',
  };
}

export function InstitutionContactDialog({
  institutionId,
  existing,
  open,
  onOpenChange,
}: {
  institutionId: string;
  existing: InstitutionContactRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<ContactFormValues>({
    resolver: formResolver<ContactFormValues>(institutionContactSchema),
    defaultValues: contactDefaults(existing),
  });

  useEffect(() => {
    if (open) {
      form.reset(contactDefaults(existing));
      setTopError(null);
    }
  }, [open, existing, form]);

  const save = useMutation({
    mutationFn: (body: object) =>
      existing
        ? api.patch(`/institutions/${institutionId}/contacts/${existing.id}`, body)
        : api.post(`/institutions/${institutionId}/contacts`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['institutions'] });
      onOpenChange(false);
    },
    onError: (err) => {
      const message = applyApiError(err, form.setError);
      if (message) setTopError(message);
    },
  });

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent unsavedChanges={form.formState.isDirty}>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit contact' : 'Add contact'}</DialogTitle>
          <DialogDescription>
            A contact person at this institution — chaplain, warden, program or release
            coordinator, or any other designation.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit((raw) => save.mutate(raw as object))();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" required error={errors.name}>
              <Input {...form.register('name')} autoFocus />
            </FormField>
            <FormField label="Role" required error={errors.role}>
              <Input {...form.register('role')} list="institution-contact-roles" placeholder="e.g. Chaplain" />
              <datalist id="institution-contact-roles">
                {ROLE_SUGGESTIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </FormField>
            <FormField label="Phone" error={errors.phone}>
              <PhoneInput {...form.register('phone')} />
            </FormField>
            <FormField label="Email" error={errors.email}>
              <Input type="email" {...form.register('email')} />
            </FormField>
          </div>
          <FormField label="Notes" error={errors.notes}>
            <Textarea rows={2} {...form.register('notes')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
