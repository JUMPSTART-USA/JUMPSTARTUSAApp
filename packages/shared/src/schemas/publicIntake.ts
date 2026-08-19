import { z } from 'zod';
import { PUBLIC_INTAKE_STATES } from '../chapters';
import { REFERRER_TYPES } from '../enums';
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
  // Which JUMPSTART chapter the applicant is applying to (§7.2) — drives
  // intake-queue chapter scoping, so it is required.
  state: z.enum(PUBLIC_INTAKE_STATES, { message: 'Select a chapter state' }),
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
  // Chapter state serving this referral (§7.2) — required, drives queue scoping.
  state: z.enum(PUBLIC_INTAKE_STATES, { message: 'Select a chapter state' }),
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

/**
 * Tokenized alumni self-update (Phase 3) — no login, single-use link.
 * Status values are a documented subset of the canonical outcome vocabularies
 * (OUTCOME_*_STATUSES in enums.ts) so approved updates map losslessly into
 * outcome check-ins; 'unknown' is omitted because a self-reporter knows.
 */
export const publicAlumniUpdateSchema = z.object({
  token: z.string().min(16).max(128),
  employmentStatus: z
    .enum(['employed_ft', 'employed_pt', 'seeking', 'unable'])
    .optional(),
  housingStatus: z.enum(['stable', 'transitional', 'unstable', 'incarcerated']).optional(),
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
