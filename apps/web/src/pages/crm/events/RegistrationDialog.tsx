import { zodResolver } from '@hookform/resolvers/zod';
import { eventRegistrationSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
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
import { Input, Select, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { cn, humanize } from '@/lib/utils';
import { applyApiErrors, PersonSearch, type PersonHit } from '../shared';
import type { RegistrationStatus } from '../types';

const REGISTRATION_STATUSES: RegistrationStatus[] = [
  'registered',
  'attended',
  'no_show',
  'canceled',
];

// eventId comes from the route; the shared schema's person-or-guest refinement
// is re-applied because omit() drops superRefine.
const registrationFormSchema = eventRegistrationSchema
  .innerType()
  .omit({ eventId: true })
  .superRefine((val, ctx) => {
    if (!val.personId && !val.externalName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a person or enter a guest name',
        path: ['externalName'],
      });
    }
  });

interface RegistrationFormValues {
  personId?: string;
  externalName?: string;
  externalEmail?: string;
  status: RegistrationStatus;
  notes?: string;
}

export function RegistrationDialog({
  open,
  onOpenChange,
  eventId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [mode, setMode] = useState<'person' | 'guest'>('person');
  const [person, setPerson] = useState<PersonHit | null>(null);

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema) as unknown as Resolver<RegistrationFormValues>,
  });

  useEffect(() => {
    if (open) {
      form.reset({ status: 'registered' });
      setPerson(null);
      setMode('person');
      setFormError(null);
    }
  }, [open]);

  const switchMode = (next: 'person' | 'guest') => {
    setMode(next);
    form.clearErrors();
    if (next === 'person') {
      form.setValue('externalName', undefined);
      form.setValue('externalEmail', undefined);
    } else {
      setPerson(null);
      form.setValue('personId', undefined);
    }
  };

  const mutation = useMutation({
    mutationFn: (values: RegistrationFormValues) =>
      api.post(`/events/${eventId}/registrations`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'events'] });
      onOpenChange(false);
    },
    // 409 = person already registered — surfaced, never swallowed.
    onError: (err) => setFormError(applyApiErrors(err, form.setError)),
  });

  const optional = { setValueAs: (v: unknown) => (v === '' ? undefined : v) };
  const modeButton = (value: 'person' | 'guest', label: string) => (
    <button
      type="button"
      onClick={() => switchMode(value)}
      className={cn(
        'rounded-md px-3 py-1 text-sm font-medium transition-colors',
        mode === value ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add registration</DialogTitle>
          <DialogDescription>
            Link a person on record, or enter a guest by name.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1">
            {modeButton('person', 'Person on record')}
            {modeButton('guest', 'Guest')}
          </div>

          {mode === 'person' ? (
            <FormField
              label="Person"
              required
              error={form.formState.errors.personId ?? form.formState.errors.externalName}
            >
              <PersonSearch
                selected={person}
                onSelect={(hit) => {
                  setPerson(hit);
                  form.setValue('personId', hit?.personId);
                  if (hit) form.clearErrors('externalName');
                }}
              />
            </FormField>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Guest name" required error={form.formState.errors.externalName}>
                <Input {...form.register('externalName', optional)} />
              </FormField>
              <FormField label="Guest email" error={form.formState.errors.externalEmail}>
                <Input type="email" {...form.register('externalEmail', optional)} />
              </FormField>
            </div>
          )}

          <FormField
            label="Status"
            required
            hint="Walk-ins recorded as attended are checked in immediately."
            error={form.formState.errors.status}
          >
            <Select {...form.register('status')}>
              {REGISTRATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Notes" error={form.formState.errors.notes}>
            <Textarea rows={2} {...form.register('notes', optional)} />
          </FormField>
          {formError ? <ErrorState error={new Error(formError)} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Add registration'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
