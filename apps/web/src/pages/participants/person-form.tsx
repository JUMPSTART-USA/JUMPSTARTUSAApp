import {
  ALUMNI_STATUSES,
  GENDERS,
  INSIDE_STATUSES,
  OUTSIDE_STATUSES,
  US_STATES,
} from '@jumpstart/shared';
import type { UseFormReturn } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { humanize } from '@/lib/utils';
import { toDateInput, type CaseManagerOption } from './shared';
import type { ParticipantDetail } from './types';

/**
 * One raw-values shape shared by the create page and the edit dialog. All
 * dates are 'yyyy-MM-dd' strings and blanks are '' — the shared Zod schemas
 * coerce on validation, and each consumer builds its own API payload.
 */
export interface ParticipantFormValues {
  person: {
    firstName: string;
    middleName: string;
    lastName: string;
    preferredName: string;
    suffix: string;
    dateOfBirth: string;
    gender: string;
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
    statusEffectiveDate: string;
    statusChangeReason: string;
  };
}

export function emptyParticipantFormValues(): ParticipantFormValues {
  return {
    person: {
      firstName: '',
      middleName: '',
      lastName: '',
      preferredName: '',
      suffix: '',
      dateOfBirth: '',
      gender: 'unspecified',
      preferredLanguage: 'en',
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
      preferredLanguage: p.person.preferredLanguage ?? 'en',
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
      statusEffectiveDate: '',
      statusChangeReason: '',
    },
  };
}

export function PersonFields({ form }: { form: UseFormReturn<ParticipantFormValues> }) {
  const {
    register,
    formState: { errors },
  } = form;
  const p = errors.person;

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
        <FormField label="Preferred language" error={p?.preferredLanguage}>
          <Input {...register('person.preferredLanguage')} placeholder="en" />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Phone" error={p?.primaryPhone}>
          <Input {...register('person.primaryPhone')} placeholder="(555) 555-5555" />
        </FormField>
        <FormField label="Email" error={p?.primaryEmail}>
          <Input {...register('person.primaryEmail')} />
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
            <Input {...register('person.zip')} />
          </FormField>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox {...register('person.emailOk')} /> Email OK
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox {...register('person.smsOk')} /> SMS OK
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox {...register('person.mailOnly')} /> Mail only
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox {...register('person.doNotContact')} /> Do not contact
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Checking SMS OK records the opt-in timestamp automatically (TCPA).
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
    formState: { errors },
  } = form;
  const pr = errors.profile;

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
        <FormField label="Outside status" error={pr?.outsideStatus}>
          <Select {...register('profile.outsideStatus')}>
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
        <FormField label="Alumni status" error={pr?.alumniStatus}>
          <Select {...register('profile.alumniStatus')}>
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
