import {
  ALUMNI_STATUSES,
  GENDERS,
  INSIDE_STATUSES,
  LEGACY_LANGUAGE_CODES,
  OUTSIDE_STATUSES,
  PREFERRED_LANGUAGES,
  RACE_LABELS,
  RACES,
  US_STATES,
} from '@jumpstart/shared';
import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/lib/auth';
import { toDateInput } from '@/lib/form';
import { humanize } from '@/lib/utils';
import type { CaseManagerOption } from './shared';
import type { ParticipantDetail } from './types';

/**
 * One raw-values shape shared by the create page and the edit dialog. All
 * dates are 'yyyy-MM-dd' strings and blanks are '' — the shared Zod schemas
 * coerce on validation, and each consumer builds its own API payload.
 */
export interface ParticipantFormValues {
  /**
   * Chapter assignment (§7.2) — create form only: rendered via ChapterSelect
   * for all-chapters users; scoped users' records are stamped server-side.
   * person.state below stays the mailing-address field.
   */
  chapterState?: string;
  person: {
    firstName: string;
    middleName: string;
    lastName: string;
    preferredName: string;
    suffix: string;
    dateOfBirth: string;
    gender: string;
    race: string;
    preferredLanguage: string;
    primaryPhone: string;
    primaryEmail: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
    emailOk: boolean;
    smsOk: boolean;
    mailOnly: boolean;
    doNotContact: boolean;
  };
  profile: {
    insideStatus: string;
    outsideStatus: string;
    phase: string;
    alumniStatus: string;
    intakeDate: string;
    releaseDate: string;
    graduationDate: string;
    assignedCaseManagerId: string;
    notes: string;
    sexOffenderRegistry: boolean;
    statusEffectiveDate: string;
    statusChangeReason: string;
  };
}

export function emptyParticipantFormValues(): ParticipantFormValues {
  return {
    chapterState: '',
    person: {
      firstName: '',
      middleName: '',
      lastName: '',
      preferredName: '',
      suffix: '',
      dateOfBirth: '',
      gender: 'unspecified',
      race: 'unspecified',
      preferredLanguage: 'English',
      primaryPhone: '',
      primaryEmail: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zip: '',
      emailOk: true,
      smsOk: false,
      mailOnly: false,
      doNotContact: false,
    },
    profile: {
      insideStatus: 'not_applicable',
      outsideStatus: 'not_applicable',
      phase: '',
      alumniStatus: 'not_applicable',
      intakeDate: '',
      releaseDate: '',
      graduationDate: '',
      assignedCaseManagerId: '',
      notes: '',
      sexOffenderRegistry: false,
      statusEffectiveDate: '',
      statusChangeReason: '',
    },
  };
}

export function participantToFormValues(p: ParticipantDetail): ParticipantFormValues {
  return {
    person: {
      firstName: p.person.firstName,
      middleName: p.person.middleName ?? '',
      lastName: p.person.lastName,
      preferredName: p.person.preferredName ?? '',
      suffix: p.person.suffix ?? '',
      dateOfBirth: toDateInput(p.person.dateOfBirth),
      gender: p.person.gender,
      race: p.person.race,
      preferredLanguage:
        LEGACY_LANGUAGE_CODES[p.person.preferredLanguage ?? ''] ??
        p.person.preferredLanguage ??
        'English',
      primaryPhone: p.person.primaryPhone ?? '',
      primaryEmail: p.person.primaryEmail ?? '',
      addressLine1: p.person.addressLine1 ?? '',
      addressLine2: p.person.addressLine2 ?? '',
      city: p.person.city ?? '',
      state: p.person.state ?? '',
      zip: p.person.zip ?? '',
      emailOk: p.person.emailOk,
      smsOk: p.person.smsOk,
      mailOnly: p.person.mailOnly,
      doNotContact: p.person.doNotContact,
    },
    profile: {
      insideStatus: p.insideStatus,
      outsideStatus: p.outsideStatus,
      phase: p.phase ?? '',
      alumniStatus: p.alumniStatus,
      intakeDate: toDateInput(p.intakeDate),
      releaseDate: toDateInput(p.releaseDate),
      graduationDate: toDateInput(p.graduationDate),
      assignedCaseManagerId: p.assignedCaseManagerId ?? '',
      notes: p.notes ?? '',
      // Absent without fields.justice.read — the checkbox is hidden then too.
      sexOffenderRegistry: p.sexOffenderRegistry ?? false,
      statusEffectiveDate: '',
      statusChangeReason: '',
    },
  };
}

export function PersonFields({ form }: { form: UseFormReturn<ParticipantFormValues> }) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const p = errors.person;
  const currentLanguage = watch('person.preferredLanguage');
  const mailOnly = watch('person.mailOnly');
  const doNotContact = watch('person.doNotContact');
  const contactRestricted = mailOnly || doNotContact;

  // Mail-only and do-not-contact switch the electronic contact methods off.
  useEffect(() => {
    if (contactRestricted) {
      setValue('person.emailOk', false);
      setValue('person.smsOk', false);
    }
    if (doNotContact) {
      setValue('person.mailOnly', false);
    }
  }, [contactRestricted, doNotContact, setValue]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="First name" required error={p?.firstName}>
          <Input {...register('person.firstName')} />
        </FormField>
        <FormField label="Middle name" error={p?.middleName}>
          <Input {...register('person.middleName')} />
        </FormField>
        <FormField label="Last name" required error={p?.lastName}>
          <Input {...register('person.lastName')} />
        </FormField>
        <FormField label="Preferred name" error={p?.preferredName}>
          <Input {...register('person.preferredName')} />
        </FormField>
        <FormField label="Suffix" error={p?.suffix}>
          <Input {...register('person.suffix')} placeholder="Jr., Sr., III…" />
        </FormField>
        <FormField label="Date of birth" error={p?.dateOfBirth}>
          <Input type="date" {...register('person.dateOfBirth')} />
        </FormField>
        <FormField label="Gender" error={p?.gender}>
          <Select {...register('person.gender')}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {humanize(g)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Race" error={p?.race}>
          <Select {...register('person.race')}>
            {RACES.map((r) => (
              <option key={r} value={r}>
                {RACE_LABELS[r]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Preferred language" error={p?.preferredLanguage}>
          <Select {...register('person.preferredLanguage')}>
            {currentLanguage && !(PREFERRED_LANGUAGES as readonly string[]).includes(currentLanguage) ? (
              <option value={currentLanguage}>{currentLanguage}</option>
            ) : null}
            {PREFERRED_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Phone" error={p?.primaryPhone}>
          <PhoneInput {...register('person.primaryPhone')} />
        </FormField>
        <FormField label="Email" error={p?.primaryEmail}>
          <Input type="email" {...register('person.primaryEmail')} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Address line 1" error={p?.addressLine1}>
          <Input {...register('person.addressLine1')} />
        </FormField>
        <FormField label="Address line 2" error={p?.addressLine2}>
          <Input {...register('person.addressLine2')} />
        </FormField>
        <FormField label="City" error={p?.city}>
          <Input {...register('person.city')} />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="State" error={p?.state}>
            <Select {...register('person.state')}>
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="ZIP" error={p?.zip}>
            <Input inputMode="numeric" {...register('person.zip')} />
          </FormField>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
        <label className={contactRestricted ? 'flex items-center gap-2 text-sm text-muted-foreground' : 'flex cursor-pointer items-center gap-2 text-sm'}>
          <Checkbox {...register('person.emailOk')} disabled={contactRestricted} /> Email OK
        </label>
        <label className={contactRestricted ? 'flex items-center gap-2 text-sm text-muted-foreground' : 'flex cursor-pointer items-center gap-2 text-sm'}>
          <Checkbox {...register('person.smsOk')} disabled={contactRestricted} /> SMS OK
        </label>
        <label className={doNotContact ? 'flex items-center gap-2 text-sm text-muted-foreground' : 'flex cursor-pointer items-center gap-2 text-sm'}>
          <Checkbox {...register('person.mailOnly')} disabled={doNotContact} /> Mail only
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox {...register('person.doNotContact')} /> Do not contact
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {doNotContact
          ? 'Do not contact — all contact methods are switched off.'
          : mailOnly
            ? 'Mail only — email and SMS are switched off.'
            : 'Checking SMS OK records the opt-in timestamp automatically (TCPA).'}
      </p>
    </div>
  );
}

export function ProfileFields({
  form,
  cmOptions,
  mode,
}: {
  form: UseFormReturn<ParticipantFormValues>;
  cmOptions: CaseManagerOption[];
  mode: 'create' | 'edit';
}) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const { can } = useAuth();
  const pr = errors.profile;
  const insideStatus = watch('profile.insideStatus');
  // Outside programming begins only after the inside chapter closes (§6.1).
  const outsideUnlocked = insideStatus === 'completed' || insideStatus === 'released';

  useEffect(() => {
    if (!outsideUnlocked) {
      setValue('profile.outsideStatus', 'not_applicable');
      setValue('profile.alumniStatus', 'not_applicable');
    }
  }, [outsideUnlocked, setValue]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Inside status" error={pr?.insideStatus}>
          <Select {...register('profile.insideStatus')}>
            {INSIDE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Outside status"
          error={pr?.outsideStatus}
          hint={outsideUnlocked ? undefined : 'Unlocks when inside status is Completed or Released.'}
        >
          <Select {...register('profile.outsideStatus')} disabled={!outsideUnlocked}>
            {OUTSIDE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Phase" error={pr?.phase}>
          <Input {...register('profile.phase')} />
        </FormField>
        <FormField
          label="Alumni status"
          error={pr?.alumniStatus}
          hint={outsideUnlocked ? undefined : 'Unlocks when inside status is Completed or Released.'}
        >
          <Select {...register('profile.alumniStatus')} disabled={!outsideUnlocked}>
            {ALUMNI_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Intake date" error={pr?.intakeDate}>
          <Input type="date" {...register('profile.intakeDate')} />
        </FormField>
        <FormField label="Release date" error={pr?.releaseDate}>
          <Input type="date" {...register('profile.releaseDate')} />
        </FormField>
        {mode === 'edit' ? (
          <FormField
            label="Graduation date"
            error={pr?.graduationDate}
            hint="Usually set through the Graduate action, which also schedules outcome check-ins."
          >
            <Input type="date" {...register('profile.graduationDate')} />
          </FormField>
        ) : null}
        <FormField label="Assigned case manager" error={pr?.assignedCaseManagerId}>
          <Select {...register('profile.assignedCaseManagerId')}>
            <option value="">Unassigned</option>
            {cmOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Notes" error={pr?.notes}>
        <Textarea rows={3} {...register('profile.notes')} />
      </FormField>

      {can('fields.justice.read') ? (
        // §7.2 justice field class: hidden without fields.justice.read — the
        // API also strips the current value from reads for those viewers.
        <div className="pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox {...register('profile.sexOffenderRegistry')} /> On the sex offender registry
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Justice-history field — visible only to staff with justice-history access.
          </p>
        </div>
      ) : null}

      {mode === 'edit' ? (
        // §4.1.6: status/phase changes append history rows; these two fields
        // feed that row — backdated entry is the norm for inside programming.
        <div className="rounded-md border bg-muted/40 p-4">
          <p className="mb-3 text-sm font-medium">Status change context</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Effective date"
              error={pr?.statusEffectiveDate}
              hint="Applied to any status/phase change above; defaults to today."
            >
              <Input type="date" {...register('profile.statusEffectiveDate')} />
            </FormField>
            <FormField label="Reason" error={pr?.statusChangeReason}>
              <Input {...register('profile.statusChangeReason')} />
            </FormField>
          </div>
        </div>
      ) : null}
    </div>
  );
}
