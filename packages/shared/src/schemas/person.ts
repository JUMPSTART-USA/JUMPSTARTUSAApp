import { z } from 'zod';
import { GENDERS, US_STATES } from '../enums';
import {
  optionalDate,
  optionalEmail,
  optionalPhone,
  optionalTrimmed,
  requiredTrimmed,
} from './common';

const dobNotInFuture = (
  val: { dateOfBirth?: Date | undefined },
  ctx: z.RefinementCtx,
) => {
  if (val.dateOfBirth && val.dateOfBirth > new Date()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Date of birth cannot be in the future',
      path: ['dateOfBirth'],
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
  preferredLanguage: z.string().trim().max(16).default('en'),
  primaryPhone: optionalPhone,
  primaryEmail: optionalEmail,
  addressLine1: optionalTrimmed,
  addressLine2: optionalTrimmed,
  city: optionalTrimmed,
  state: z.enum(US_STATES).optional(),
  zip: optionalTrimmed,
  emailOk: z.boolean().default(true),
  smsOk: z.boolean().default(false),
  mailOnly: z.boolean().default(false),
  doNotContact: z.boolean().default(false),
});

export const personCoreSchema = personCoreBaseSchema.superRefine(dobNotInFuture);
export const personCorePartialSchema = personCoreBaseSchema
  .partial()
  .superRefine(dobNotInFuture);

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
