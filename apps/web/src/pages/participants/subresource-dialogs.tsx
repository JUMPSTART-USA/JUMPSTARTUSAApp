import {
  INSIDE_LOCATION_STATUSES,
  OFFENSE_TYPE_LABELS,
  OFFENSE_TYPES,
  participantDocIdSchema,
  participantInsideLocationSchema,
  participantOffenseSchema,
  personAddressSchema,
  personContactSchema,
  testimonyConsentSchema,
  US_STATES,
} from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type FieldValues, type UseFormSetError } from 'react-hook-form';
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
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { PhoneInput } from '@/components/ui/phone-input';
import { api, qs, type Paged } from '@/lib/api';
import { applyApiError, formResolver, toDateInput, todayInput } from '@/lib/form';
import { humanize } from '@/lib/utils';
import type {
  DocIdRow,
  InsideLocationRow,
  OffenseRow,
  PersonAddressRow,
  PersonContactRow,
  TestimonyConsentRow,
} from './types';

/**
 * Dialogs for the person-level sub-resources reached through the participant
 * record. PATCH bodies for contacts/addresses/consents validate the FULL
 * shared schema (whole-record replacement — omitted optionals clear), so each
 * dialog always submits the complete form.
 */

interface SubresourceDialogProps<T> {
  participantId: string;
  existing: T | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useSaveMutation<T extends FieldValues>(
  participantId: string,
  path: string,
  existingId: string | undefined,
  setError: UseFormSetError<T>,
  setTopError: (m: string | null) => void,
  onOpenChange: (open: boolean) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: object) =>
      existingId
        ? api.patch(`/participants/${participantId}/${path}/${existingId}`, body)
        : api.post(`/participants/${participantId}/${path}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['participants', participantId] });
      onOpenChange(false);
    },
    onError: (err) => {
      const message = applyApiError(err, setError);
      if (message) setTopError(message);
    },
  });
}

// ── Contacts (§7.4: minors carry minimal data) ──────────────────────────────

interface ContactFormValues {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  isEmergency: boolean;
  isMinor: boolean;
  guardianName: string;
  notes: string;
}

function contactDefaults(existing: PersonContactRow | null): ContactFormValues {
  return {
    name: existing?.name ?? '',
    relationship: existing?.relationship ?? '',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    isEmergency: existing?.isEmergency ?? false,
    isMinor: existing?.isMinor ?? false,
    guardianName: existing?.guardianName ?? '',
    notes: existing?.notes ?? '',
  };
}

export function ContactDialog({
  participantId,
  existing,
  open,
  onOpenChange,
}: SubresourceDialogProps<PersonContactRow>) {
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<ContactFormValues>({
    resolver: formResolver<ContactFormValues>(personContactSchema),
    defaultValues: contactDefaults(existing),
  });
  useEffect(() => {
    if (open) {
      form.reset(contactDefaults(existing));
      setTopError(null);
    }
  }, [open, existing, form]);

  const save = useSaveMutation(
    participantId,
    'contacts',
    existing?.id,
    form.setError,
    setTopError,
    onOpenChange,
  );
  const errors = form.formState.errors;
  const isMinor = form.watch('isMinor');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit contact' : 'Add contact'}</DialogTitle>
          <DialogDescription>Emergency contacts and family members.</DialogDescription>
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
              <Input {...form.register('name')} />
            </FormField>
            <FormField label="Relationship" required error={errors.relationship}>
              <Input {...form.register('relationship')} placeholder="Mother, friend, pastor…" />
            </FormField>
            <FormField label="Phone" error={errors.phone}>
              <PhoneInput {...form.register('phone')} />
            </FormField>
            <FormField label="Email" error={errors.email}>
              <Input type="email" {...form.register('email')} />
            </FormField>
          </div>
          <div className="flex gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox {...form.register('isEmergency')} /> Emergency contact
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox {...form.register('isMinor')} /> Minor
            </label>
          </div>
          {isMinor ? (
            <FormField
              label="Guardian name"
              error={errors.guardianName}
              hint="For a minor, any phone recorded must belong to the guardian named here."
            >
              <Input {...form.register('guardianName')} />
            </FormField>
          ) : null}
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

// ── Addresses (history table — no delete, §4.1.6) ───────────────────────────

interface AddressFormValues {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  addressType: string;
  isCurrent: boolean;
  validFrom: string;
  validTo: string;
  notes: string;
}

function addressDefaults(existing: PersonAddressRow | null): AddressFormValues {
  return {
    addressLine1: existing?.addressLine1 ?? '',
    addressLine2: existing?.addressLine2 ?? '',
    city: existing?.city ?? '',
    state: existing?.state ?? '',
    zip: existing?.zip ?? '',
    addressType: existing?.addressType ?? '',
    isCurrent: existing?.isCurrent ?? false,
    validFrom: toDateInput(existing?.validFrom),
    validTo: toDateInput(existing?.validTo),
    notes: existing?.notes ?? '',
  };
}

export function AddressDialog({
  participantId,
  existing,
  open,
  onOpenChange,
}: SubresourceDialogProps<PersonAddressRow>) {
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<AddressFormValues>({
    resolver: formResolver<AddressFormValues>(personAddressSchema),
    defaultValues: addressDefaults(existing),
  });
  useEffect(() => {
    if (open) {
      form.reset(addressDefaults(existing));
      setTopError(null);
    }
  }, [open, existing, form]);

  const save = useSaveMutation(
    participantId,
    'addresses',
    existing?.id,
    form.setError,
    setTopError,
    onOpenChange,
  );
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit address' : 'Add address'}</DialogTitle>
          <DialogDescription>
            Marking an address current mirrors it onto the mailing address and clears the current
            flag from other addresses.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit((raw) => save.mutate(raw as object))();
          }}
          className="space-y-4"
        >
          <FormField label="Address line 1" required error={errors.addressLine1}>
            <Input {...form.register('addressLine1')} />
          </FormField>
          <FormField label="Address line 2" error={errors.addressLine2}>
            <Input {...form.register('addressLine2')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="City" required error={errors.city}>
              <Input {...form.register('city')} />
            </FormField>
            <FormField label="State" required error={errors.state}>
              <Select {...form.register('state')}>
                <option value="">—</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="ZIP" required error={errors.zip}>
              <Input inputMode="numeric" {...form.register('zip')} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Type" error={errors.addressType}>
              <Input {...form.register('addressType')} placeholder="home, facility, mailing…" />
            </FormField>
            <FormField label="Valid from" error={errors.validFrom}>
              <Input type="date" {...form.register('validFrom')} />
            </FormField>
            <FormField label="Valid to" error={errors.validTo}>
              <Input type="date" {...form.register('validTo')} />
            </FormField>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox {...form.register('isCurrent')} /> Current address
          </label>
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

// ── Inside locations (current + past institutions — §6.1) ───────────────────

interface InsideLocationFormValues {
  institutionId: string;
  status: string;
  startDate: string;
  endDate: string;
  notes: string;
}

function insideLocationDefaults(existing: InsideLocationRow | null): InsideLocationFormValues {
  return {
    institutionId: existing?.institutionId ?? '',
    status: existing?.status ?? 'active',
    startDate: toDateInput(existing?.startDate ?? null),
    endDate: toDateInput(existing?.endDate ?? null),
    notes: existing?.notes ?? '',
  };
}

export function InsideLocationDialog({
  participantId,
  existing,
  open,
  onOpenChange,
}: SubresourceDialogProps<InsideLocationRow>) {
  const [topError, setTopError] = useState<string | null>(null);
  const institutions = useQuery({
    queryKey: ['participants', 'institution-options'],
    queryFn: () =>
      api.get<Paged<{ id: string; name: string; state: string }>>(
        `/institutions${qs({ pageSize: 200, sortBy: 'name' })}`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<InsideLocationFormValues>({
    resolver: formResolver<InsideLocationFormValues>(participantInsideLocationSchema),
    defaultValues: insideLocationDefaults(existing),
  });
  useEffect(() => {
    if (open) {
      form.reset(insideLocationDefaults(existing));
      setTopError(null);
    }
  }, [open, existing, form]);

  const save = useSaveMutation(
    participantId,
    'inside-locations',
    existing?.id,
    form.setError,
    setTopError,
    onOpenChange,
  );
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit inside location' : 'Add inside location'}</DialogTitle>
          <DialogDescription>
            Institution where the participant is (or was) incarcerated. Marking a location Active
            automatically closes any other active location.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit((raw) => save.mutate(raw as object))();
          }}
          className="space-y-4"
        >
          <FormField label="Institution" required error={errors.institutionId}>
            <Select {...form.register('institutionId')}>
              <option value="">—</option>
              {(institutions.data?.items ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.state})
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Status" required error={errors.status}>
              <Select {...form.register('status')}>
                {INSIDE_LOCATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Arrived" error={errors.startDate}>
              <Input type="date" {...form.register('startDate')} />
            </FormField>
            <FormField label="Left" error={errors.endDate}>
              <Input type="date" {...form.register('endDate')} />
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

// ── Most serious offenses (justice-history field class — §7.2) ──────────────

interface OffenseFormValues {
  offense: string;
  offenseType: string;
  convictionDate: string;
  sentenceYears: string;
  sentenceMonths: string;
  sentenceDays: string;
}

function offenseDefaults(existing: OffenseRow | null): OffenseFormValues {
  return {
    offense: existing?.offense ?? '',
    offenseType: existing?.offenseType ?? 'non_violent',
    convictionDate: toDateInput(existing?.convictionDate ?? null),
    sentenceYears: existing?.sentenceYears != null ? String(existing.sentenceYears) : '',
    sentenceMonths: existing?.sentenceMonths != null ? String(existing.sentenceMonths) : '',
    sentenceDays: existing?.sentenceDays != null ? String(existing.sentenceDays) : '',
  };
}

export function OffenseDialog({
  participantId,
  existing,
  open,
  onOpenChange,
}: SubresourceDialogProps<OffenseRow>) {
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<OffenseFormValues>({
    resolver: formResolver<OffenseFormValues>(participantOffenseSchema),
    defaultValues: offenseDefaults(existing),
  });
  useEffect(() => {
    if (open) {
      form.reset(offenseDefaults(existing));
      setTopError(null);
    }
  }, [open, existing, form]);

  const save = useSaveMutation(
    participantId,
    'offenses',
    existing?.id,
    form.setError,
    setTopError,
    onOpenChange,
  );
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit offense' : 'Add offense'}</DialogTitle>
          <DialogDescription>
            Most serious offense on record. Justice-history data — visible only to staff with
            justice-history access.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit((raw) => save.mutate(raw as object))();
          }}
          className="space-y-4"
        >
          <FormField label="Offense" required error={errors.offense}>
            <Input {...form.register('offense')} placeholder="e.g. Aggravated burglary" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type" required error={errors.offenseType}>
              <Select {...form.register('offenseType')}>
                {OFFENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {OFFENSE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Conviction date" error={errors.convictionDate}>
              <Input type="date" {...form.register('convictionDate')} />
            </FormField>
          </div>
          <div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Sentence — years" error={errors.sentenceYears}>
                <Input type="number" min={0} {...form.register('sentenceYears')} />
              </FormField>
              <FormField label="Months" error={errors.sentenceMonths}>
                <Input type="number" min={0} {...form.register('sentenceMonths')} />
              </FormField>
              <FormField label="Days" error={errors.sentenceDays}>
                <Input type="number" min={0} {...form.register('sentenceDays')} />
              </FormField>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter the sentence as recorded — any combination of years, months and days.
            </p>
          </div>
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

// ── DOC IDs (justice-history field class — §7.2, §7.5) ──────────────────────

interface DocIdFormValues {
  state: string;
  docNumber: string;
  source: string;
}

const DOC_ID_SOURCES = ['staff_entered', 'doc', 'import'] as const;

export function DocIdDialog({
  participantId,
  existing,
  open,
  onOpenChange,
}: SubresourceDialogProps<DocIdRow>) {
  const [topError, setTopError] = useState<string | null>(null);
  const defaults = (): DocIdFormValues => ({
    state: existing?.state ?? '',
    docNumber: existing?.docNumber ?? '',
    source: existing?.source ?? 'staff_entered',
  });
  const form = useForm<DocIdFormValues>({
    resolver: formResolver<DocIdFormValues>(participantDocIdSchema),
    defaultValues: defaults(),
  });
  useEffect(() => {
    if (open) {
      form.reset({
        state: existing?.state ?? '',
        docNumber: existing?.docNumber ?? '',
        source: existing?.source ?? 'staff_entered',
      });
      setTopError(null);
    }
  }, [open, existing, form]);

  const save = useSaveMutation(
    participantId,
    'doc-ids',
    existing?.id,
    form.setError,
    setTopError,
    onOpenChange,
  );
  const errors = form.formState.errors;
  const masked = Boolean(existing) && existing?.docNumber === undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit DOC ID' : 'Add DOC ID'}</DialogTitle>
          <DialogDescription>
            Department of Corrections identifier for this participant in a state system.
          </DialogDescription>
        </DialogHeader>
        {masked ? (
          <Notice variant="warning">
            The existing DOC number is hidden from your account (justice-history field class). A
            value entered below will replace it.
          </Notice>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit((raw) => save.mutate(raw as object))();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="State" required error={errors.state}>
              <Select {...form.register('state')}>
                <option value="">—</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="DOC number" required error={errors.docNumber}>
              <Input {...form.register('docNumber')} />
            </FormField>
            <FormField label="Source" error={errors.source}>
              <Select {...form.register('source')}>
                {DOC_ID_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
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

// ── Testimony consents (revocable, never deleted — §7.4) ────────────────────

interface ConsentFormValues {
  scope: string;
  grantedAt: string;
  revokedAt: string;
  notes: string;
}

function consentDefaults(existing: TestimonyConsentRow | null): ConsentFormValues {
  return {
    scope: existing?.scope ?? '',
    // "When was consent granted" is an event date — default new rows to today.
    grantedAt: existing ? toDateInput(existing.grantedAt) : todayInput(),
    revokedAt: toDateInput(existing?.revokedAt),
    notes: existing?.notes ?? '',
  };
}

export function ConsentDialog({
  participantId,
  existing,
  open,
  onOpenChange,
}: SubresourceDialogProps<TestimonyConsentRow>) {
  const [topError, setTopError] = useState<string | null>(null);
  const form = useForm<ConsentFormValues>({
    resolver: formResolver<ConsentFormValues>(testimonyConsentSchema),
    defaultValues: consentDefaults(existing),
  });
  useEffect(() => {
    if (open) {
      form.reset(consentDefaults(existing));
      setTopError(null);
    }
  }, [open, existing, form]);

  const save = useSaveMutation(
    participantId,
    'testimony-consents',
    existing?.id,
    form.setError,
    setTopError,
    onOpenChange,
  );
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit testimony consent' : 'Add testimony consent'}</DialogTitle>
          <DialogDescription>
            Consent to use this person&apos;s name or story. Set a revocation date to revoke —
            consents are never deleted.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit((raw) => save.mutate(raw as object))();
          }}
          className="space-y-4"
        >
          <FormField label="Scope" required error={errors.scope} hint='e.g. "newsletter", "website", "grant reports", "all"'>
            <Input {...form.register('scope')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Granted" required error={errors.grantedAt}>
              <Input type="date" {...form.register('grantedAt')} />
            </FormField>
            <FormField label="Revoked" error={errors.revokedAt}>
              <Input type="date" {...form.register('revokedAt')} />
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
