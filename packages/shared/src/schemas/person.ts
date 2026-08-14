import { z } from 'zod';
import { GENDERS, RACES, US_STATES } from '../enums';
import {
  clearableTrimmed,
  endNotBeforeStart,
  optionalDate,
  optionalEmail,
  optionalPhone,
  optionalTrimmed,
  requiredDate,
  requiredTrimmed,
} from './common';

const personDatesValid = (
  val: { dateOfBirth?: Date | undefined; deceasedAt?: Date | undefined },
  ctx: z.RefinementCtx,
) => {
  const now = new Date();
  if (val.dateOfBirth && val.dateOfBirth > now) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Date of birth cannot be in the future',
      path: ['dateOfBirth'],
    });
  }
  if (val.deceasedAt && val.deceasedAt > now) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Date of death cannot be in the future',
      path: ['deceasedAt'],
    });
  }
};

/** Unrefined base — use `.partial()` on this for update payloads. */
export const personCoreBaseSchema = z.object({
  firstName: requiredTrimmed.pipe(z.string().max(100)),
  middleName: optionalTrimmed,
  lastName: requiredTrimmed.pipe(z.string().max(100)),
  preferredName: optionalTrimmed,
  suffix: optionalTrimmed,
  dateOfBirth: optionalDate,
  gender: z.enum(GENDERS).default('unspecified'),
  race: z.enum(RACES).default('unspecified'),
  preferredLanguage: z.string().trim().max(16).default('en'),
  primaryPhone: optionalPhone,
  primaryEmail: optionalEmail,
  // Social media profiles — full URL or bare handle (SOCIAL_MEDIA_FIELDS).
  // Clearable (null = clear, '' → null), matching donorSchema: a blanked
  // input on the edit dialogs must actually remove the stored value.
  facebookUrl: clearableTrimmed,
  instagramUrl: clearableTrimmed,
  twitterUrl: clearableTrimmed,
  linkedinUrl: clearableTrimmed,
  tiktokUrl: clearableTrimmed,
  youtubeUrl: clearableTrimmed,
  addressLine1: optionalTrimmed,
  addressLine2: optionalTrimmed,
  city: optionalTrimmed,
  state: z.enum(US_STATES).optional(),
  zip: optionalTrimmed,
  // Mailing address — the service nulls the mailing* columns whenever
  // mailingSameAsPrimary is true, so stale values never linger. Value fields
  // are clearable (null = clear, '' → null) like the donor's.
  mailingSameAsPrimary: z.boolean().default(true),
  mailingAddressLine1: clearableTrimmed,
  mailingAddressLine2: clearableTrimmed,
  mailingCity: clearableTrimmed,
  mailingState: z.enum(US_STATES).nullable().optional(),
  mailingZip: clearableTrimmed,
  emailOk: z.boolean().default(true),
  smsOk: z.boolean().default(false),
  mailOnly: z.boolean().default(false),
  doNotContact: z.boolean().default(false),
  deceasedAt: optionalDate,
});

export const personCoreSchema = personCoreBaseSchema.superRefine(personDatesValid);
export const personCorePartialSchema = personCoreBaseSchema
  .partial()
  .superRefine(personDatesValid);

export type PersonCoreInput = z.infer<typeof personCoreSchema>;

export const personContactSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(200)),
  relationship: requiredTrimmed.pipe(z.string().max(100)),
  phone: optionalPhone,
  email: optionalEmail,
  isEmergency: z.boolean().default(false),
  isMinor: z.boolean().default(false),
  guardianName: optionalTrimmed,
  notes: optionalTrimmed,
}).superRefine((val, ctx) => {
  // §7.4: minors carry minimal data — the phone recorded must be a guardian's
  if (val.isMinor && !val.guardianName && val.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'For a minor, record the guardian name the phone number belongs to',
      path: ['guardianName'],
    });
  }
});

export type PersonContactInput = z.infer<typeof personContactSchema>;

/** Address-history rows (staff-managed; the service also snapshots on change). */
export const personAddressSchema = z
  .object({
    addressLine1: requiredTrimmed.pipe(z.string().max(300)),
    addressLine2: optionalTrimmed,
    city: requiredTrimmed.pipe(z.string().max(100)),
    state: z.enum(US_STATES),
    zip: requiredTrimmed.pipe(z.string().max(20)),
    addressType: optionalTrimmed,
    isCurrent: z.boolean().default(false),
    validFrom: optionalDate,
    validTo: optionalDate,
    notes: optionalTrimmed,
  })
  .superRefine(endNotBeforeStart('validFrom', 'validTo'));
export type PersonAddressInput = z.infer<typeof personAddressSchema>;

/** §7.4 alumni dignity: consent to use a person's name/story, revocable. */
export const testimonyConsentSchema = z
  .object({
    scope: requiredTrimmed.pipe(z.string().max(200)),
    grantedAt: requiredDate,
    revokedAt: optionalDate,
    notes: optionalTrimmed,
  })
  .superRefine(
    endNotBeforeStart('grantedAt', 'revokedAt', 'Revocation date cannot be before grant date'),
  );
export type TestimonyConsentInput = z.infer<typeof testimonyConsentSchema>;
