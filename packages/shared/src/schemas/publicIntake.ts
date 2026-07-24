import { z } from 'zod';
import { REFERRER_TYPES, US_STATES } from '../enums';
import { optionalDate, optionalEmail, optionalPhone, optionalTrimmed, requiredTrimmed } from './common';

// Public-form schemas (§6.11). These validate UNTRUSTED input from the
// marketing site — strict lengths, no HTML, Turnstile + rate limiting happen
// before validation. Submissions land in intake queues, never in live tables.

export const publicVolunteerApplicationSchema = z.object({
  firstName: requiredTrimmed.pipe(z.string().max(100)),
  lastName: requiredTrimmed.pipe(z.string().max(100)),
  email: optionalEmail,
  phone: optionalPhone,
  city: optionalTrimmed,
  state: z.enum(US_STATES).optional(),
  interestAreas: z.array(z.string().trim().max(100)).max(20).default([]),
  availability: z.string().trim().max(1000).optional(),
  churchAffiliation: z.string().trim().max(200).optional(),
  message: z.string().trim().max(4000).optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Consent is required to submit an application' }),
  }),
  turnstileToken: z.string().max(4096).optional(),
}).superRefine((val, ctx) => {
  if (!val.email && !val.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide an email address or phone number so we can reach you',
      path: ['email'],
    });
  }
});
export type PublicVolunteerApplicationInput = z.infer<typeof publicVolunteerApplicationSchema>;

/**
 * "Get help / refer someone" — the front door, not the case file. The form
 * warns against including sensitive detail; needs is capped accordingly.
 */
export const publicReferralSchema = z.object({
  referrerType: z.enum(REFERRER_TYPES),
  referrerName: optionalTrimmed,
  referrerPhone: optionalPhone,
  referrerEmail: optionalEmail,
  subjectFirstName: requiredTrimmed.pipe(z.string().max(100)),
  subjectLastName: requiredTrimmed.pipe(z.string().max(100)),
  subjectPhone: optionalPhone,
  facilityName: z.string().trim().max(200).optional(),
  state: z.enum(US_STATES).optional(),
  expectedReleaseDate: optionalDate,
  needs: requiredTrimmed.pipe(z.string().max(4000)),
  turnstileToken: z.string().max(4096).optional(),
}).superRefine((val, ctx) => {
  if (val.referrerType !== 'self' && !val.referrerName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please tell us who is making this referral',
      path: ['referrerName'],
    });
  }
  if (val.referrerType !== 'self' && !val.referrerPhone && !val.referrerEmail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide a phone or email so our team can follow up',
      path: ['referrerEmail'],
    });
  }
});
export type PublicReferralInput = z.infer<typeof publicReferralSchema>;

/** Tokenized alumni self-update (Phase 3) — no login, single-use link. */
export const publicAlumniUpdateSchema = z.object({
  token: z.string().min(16).max(128),
  employmentStatus: z
    .enum(['employed_ft', 'employed_pt', 'seeking', 'unable', 'other'])
    .optional(),
  housingStatus: z.enum(['stable', 'transitional', 'unstable', 'other']).optional(),
  newPhone: optionalPhone,
  newEmail: optionalEmail,
  newAddress: z.string().trim().max(500).optional(),
  message: z.string().trim().max(4000).optional(),
});
export type PublicAlumniUpdateInput = z.infer<typeof publicAlumniUpdateSchema>;

/** Intake queue review actions (staff side). */
export const intakeReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'spam']),
  reviewNotes: optionalTrimmed,
  /** On approve: link to an existing person instead of creating a new one. */
  existingPersonId: z.string().uuid().optional(),
});
export type IntakeReviewInput = z.infer<typeof intakeReviewSchema>;
