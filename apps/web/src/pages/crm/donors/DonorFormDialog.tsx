import { donorSchema, DONOR_TYPES, SOCIAL_MEDIA_FIELDS, US_STATES } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ChapterSelect } from '@/components/ChapterSelect';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { PhoneInput } from '@/components/ui/phone-input';
import { api, ApiError } from '@/lib/api';
import { applyApiError, formResolver } from '@/lib/form';
import { fullName, humanize } from '@/lib/utils';
import { PersonSearch, type PersonHit } from '../shared';
import type { Donor, DuplicatePersonCandidate, PersonRef } from '../types';

const DONOR_STATUSES = ['active', 'lapsed', 'inactive'] as const;

interface DonorFormValues {
  donorType: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  /** Postal address state — NOT the chapter. */
  state: string;
  zip: string;
  /** Mailing address — fields disabled (and cleared server-side) while "same as" is checked. */
  mailingSameAsPrimary: boolean;
  mailingAddressLine1: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  linkedinUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  /** Chapter (§7.2) — the API stamps scoped users' own chapter. */
  chapterState: string;
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
    mailingSameAsPrimary: donor?.mailingSameAsPrimary ?? true,
    mailingAddressLine1: donor?.mailingAddressLine1 ?? '',
    mailingCity: donor?.mailingCity ?? '',
    mailingState: donor?.mailingState ?? '',
    mailingZip: donor?.mailingZip ?? '',
    facebookUrl: donor?.facebookUrl ?? '',
    instagramUrl: donor?.instagramUrl ?? '',
    twitterUrl: donor?.twitterUrl ?? '',
    linkedinUrl: donor?.linkedinUrl ?? '',
    tiktokUrl: donor?.tiktokUrl ?? '',
    youtubeUrl: donor?.youtubeUrl ?? '',
    chapterState: donor?.chapterState ?? '',
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
  const navigate = useNavigate();
  const [topError, setTopError] = useState<string | null>(null);
  const [linkedPerson, setLinkedPerson] = useState<PersonHit | null>(null);
  // §5: person matches from the create 409 — reviewed before creating anew.
  const [candidates, setCandidates] = useState<DuplicatePersonCandidate[] | null>(null);
  const lastValues = useRef<DonorFormValues | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DonorFormValues>({
    resolver: formResolver<DonorFormValues>(donorSchema),
    defaultValues: buildDefaults(donor),
  });
  const mailingSame = watch('mailingSameAsPrimary');

  useEffect(() => {
    if (open) {
      reset(buildDefaults(donor));
      setLinkedPerson(
        person ? { personId: person.id, name: fullName(person), source: 'Linked' } : null,
      );
      setTopError(null);
      setCandidates(null);
      lastValues.current = null;
    }
  }, [open, donor, person, reset]);

  const mutation = useMutation({
    mutationFn: (values: DonorFormValues & { confirmNotDuplicate?: boolean }) =>
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
            mailingAddressLine1: values.mailingAddressLine1 ?? null,
            mailingCity: values.mailingCity ?? null,
            mailingState: values.mailingState ?? null,
            mailingZip: values.mailingZip ?? null,
            facebookUrl: values.facebookUrl ?? null,
            instagramUrl: values.instagramUrl ?? null,
            twitterUrl: values.twitterUrl ?? null,
            linkedinUrl: values.linkedinUrl ?? null,
            tiktokUrl: values.tiktokUrl ?? null,
            youtubeUrl: values.youtubeUrl ?? null,
            notes: values.notes ?? null,
            personId: values.personId ?? null,
          })
        : api.post<Donor>('/donors', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'donors'] });
      onOpenChange(false);
    },
    onError: (err) => {
      // Create-mode 409 carries person candidates — surface them for review.
      if (!donor && err instanceof ApiError && err.status === 409) {
        const body = err.body as { candidates?: DuplicatePersonCandidate[] } | undefined;
        if (body?.candidates && body.candidates.length > 0) {
          setCandidates(body.candidates);
          setTopError(null);
          return;
        }
      }
      setTopError(applyApiError(err, setError));
    },
  });

  const submitValues = (values: DonorFormValues) => {
    lastValues.current = values;
    mutation.mutate(values);
  };

  /** Candidate action: create the donor already linked to the chosen person. */
  const linkAndCreate = (c: DuplicatePersonCandidate) => {
    const values = lastValues.current;
    if (!values) return;
    setLinkedPerson({
      personId: c.personId,
      name: `${c.firstName} ${c.lastName}`,
      source: 'Linked',
    });
    setValue('personId', c.personId, { shouldDirty: true });
    setCandidates(null);
    mutation.mutate({ ...values, personId: c.personId });
  };

  const createAnyway = () => {
    const values = lastValues.current;
    if (!values) return;
    setCandidates(null);
    mutation.mutate({ ...values, confirmNotDuplicate: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{donor ? 'Edit donor' : 'New donor'}</DialogTitle>
        </DialogHeader>
        {candidates ? (
          <div className="space-y-3">
            <Notice variant="warning">
              This donor looks like {candidates.length === 1 ? 'an existing person' : 'existing people'}{' '}
              already in the system. Linking keeps one record per human (§5) — giving, volunteering
              and program history stay connected.
            </Notice>
            <div className="space-y-2">
              {candidates.map((c) => (
                <div
                  key={c.personId}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="truncate">
                        {c.firstName} {c.lastName}
                      </span>
                      {c.isParticipant ? <Badge variant="info">Participant</Badge> : null}
                      {c.isVolunteer ? <Badge variant="gold">Volunteer</Badge> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[
                        c.primaryEmail,
                        c.primaryPhone,
                        [c.city, c.state].filter(Boolean).join(', ') || null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No contact details on file'}
                    </div>
                  </div>
                  {c.existingDonor ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/donors/${c.existingDonor!.id}`);
                      }}
                    >
                      Open existing donor
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={mutation.isPending}
                      onClick={() => linkAndCreate(c)}
                    >
                      Link this person
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <FormError message={topError} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCandidates(null)}>
                Back to form
              </Button>
              <Button onClick={createAnyway} disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Create anyway — not a match'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <form onSubmit={handleSubmit(submitValues)} className="space-y-4" noValidate>
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
            {/* Chapter (§7.2) — hidden for scoped users; the API stamps theirs. */}
            <ChapterSelect error={errors.chapterState} {...register('chapterState')} />
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
                <Input inputMode="numeric" {...register('zip')} />
              </FormField>
            </div>
          </div>

          {/* Mailing address: inputs stay visible but disabled while "same as" is
              checked; the API also nulls the mailing columns whenever it is set. */}
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox {...register('mailingSameAsPrimary')} /> Mailing address is the same as the
              address above
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Mailing address"
                error={errors.mailingAddressLine1}
                className="sm:col-span-2"
              >
                <Input {...register('mailingAddressLine1')} disabled={mailingSame} />
              </FormField>
              <FormField label="Mailing city" error={errors.mailingCity}>
                <Input {...register('mailingCity')} disabled={mailingSame} />
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Mailing state" error={errors.mailingState}>
                  <Select {...register('mailingState')} disabled={mailingSame}>
                    <option value="">Select…</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Mailing ZIP" error={errors.mailingZip}>
                  <Input inputMode="numeric" {...register('mailingZip')} disabled={mailingSame} />
                </FormField>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium">Social media</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {SOCIAL_MEDIA_FIELDS.map((f) => (
                <FormField key={f.key} label={f.label} error={errors[f.key]}>
                  <Input {...register(f.key)} placeholder="URL or handle" />
                </FormField>
              ))}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
