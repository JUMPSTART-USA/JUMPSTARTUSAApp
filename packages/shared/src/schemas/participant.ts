import { z } from 'zod';
import {
  ALUMNI_STATUSES,
  INSIDE_LOCATION_STATUSES,
  INSIDE_STATUSES,
  OFFENSE_TYPES,
  OUTSIDE_STATUSES,
  US_STATES,
} from '../enums';
import {
  clearableDate,
  clearableUuid,
  endNotBeforeStart,
  optionalDate,
  optionalTrimmed,
  uuid,
} from './common';
import { personCorePartialSchema, personCoreSchema } from './person';

export const participantProfileFieldsSchema = z.object({
  insideStatus: z.enum(INSIDE_STATUSES).default('not_applicable'),
  outsideStatus: z.enum(OUTSIDE_STATUSES).default('not_applicable'),
  phase: optionalTrimmed,
  alumniStatus: z.enum(ALUMNI_STATUSES).default('not_applicable'),
  intakeDate: optionalDate,
  releaseDate: optionalDate,
  graduationDate: optionalDate,
  assignedCaseManagerId: uuid.optional(),
  notes: optionalTrimmed,
  /** Justice field class (§7.2): reads require fields.justice.read; writes are staff edits. */
  sexOffenderRegistry: z.boolean().default(false),
});

/** Create = person fields + profile fields in one submission. */
export const participantCreateSchema = z.object({
  person: personCoreSchema,
  profile: participantProfileFieldsSchema,
  /** Set true to skip the duplicate-candidate check after reviewing matches. */
  confirmNotDuplicate: z.boolean().default(false),
});
export type ParticipantCreateInput = z.infer<typeof participantCreateSchema>;

/**
 * Update semantics: null = clear the field, undefined = no change (dates and
 * the case-manager assignment are clearable — data-entry mistakes happen).
 * When any status/phase field changes, the service appends to
 * participant_status_history; statusEffectiveDate/statusChangeReason feed that
 * row — after-the-fact (backdated) entry is the norm for inside programming
 * (plan assumption #10).
 */
export const participantProfileUpdateFieldsSchema = z.object({
  insideStatus: z.enum(INSIDE_STATUSES).optional(),
  outsideStatus: z.enum(OUTSIDE_STATUSES).optional(),
  phase: optionalTrimmed,
  alumniStatus: z.enum(ALUMNI_STATUSES).optional(),
  intakeDate: clearableDate,
  releaseDate: clearableDate,
  graduationDate: clearableDate,
  assignedCaseManagerId: clearableUuid,
  notes: optionalTrimmed,
  sexOffenderRegistry: z.boolean().optional(),
  statusEffectiveDate: optionalDate,
  statusChangeReason: optionalTrimmed,
});

export const participantUpdateSchema = z.object({
  person: personCorePartialSchema.optional(),
  profile: participantProfileUpdateFieldsSchema.optional(),
});
export type ParticipantUpdateInput = z.infer<typeof participantUpdateSchema>;

/** '' → undefined so blank number inputs don't coerce to 0. */
const sentencePart = (max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).max(max).optional(),
  );

/**
 * Most serious offenses (§7.2 justice field class): reads require
 * fields.justice.read; writes are staff edits like DOC IDs. PATCH validates
 * the FULL schema (whole-record replacement — omitted optionals clear).
 */
export const participantOffenseSchema = z.object({
  offense: z.string().trim().min(1, 'Required').max(300),
  offenseType: z.enum(OFFENSE_TYPES),
  convictionDate: optionalDate,
  sentenceYears: sentencePart(150),
  sentenceMonths: sentencePart(600),
  sentenceDays: sentencePart(10_000),
});
export type ParticipantOffenseInput = z.infer<typeof participantOffenseSchema>;

/**
 * Inside locations (§6.1): where the participant is or was incarcerated.
 * PATCH validates the FULL schema (whole-record replacement — omitted
 * optionals clear). One active row per participant is enforced by the
 * service: creating/updating a row to active closes the others.
 */
export const participantInsideLocationSchema = z
  .object({
    institutionId: uuid,
    status: z.enum(INSIDE_LOCATION_STATUSES).default('active'),
    startDate: optionalDate,
    endDate: optionalDate,
    notes: optionalTrimmed,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));
export type ParticipantInsideLocationInput = z.infer<typeof participantInsideLocationSchema>;

/** Records release from custody (§6.1): inside status → released. */
export const releaseSchema = z.object({
  releaseDate: z.coerce.date(),
  reason: optionalTrimmed,
});
export type ReleaseInput = z.infer<typeof releaseSchema>;

export const participantDocIdSchema = z.object({
  state: z.enum(US_STATES),
  docNumber: z.string().trim().min(1).max(50),
  source: z.enum(['staff_entered', 'doc', 'import']).default('staff_entered'),
  dataSharingAgreementId: uuid.optional(),
});
export type ParticipantDocIdInput = z.infer<typeof participantDocIdSchema>;

/**
 * Graduation requires completion assessments on active enrollments or an
 * explicit override with reason (§6.1 workflow 3) — override is audit-logged.
 */
export const graduationSchema = z.object({
  graduationDate: z.coerce.date(),
  overrideIncompleteAssessments: z.boolean().default(false),
  overrideReason: optionalTrimmed,
}).superRefine((val, ctx) => {
  if (val.overrideIncompleteAssessments && !val.overrideReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'An override reason is required when graduating with incomplete assessments',
      path: ['overrideReason'],
    });
  }
});
export type GraduationInput = z.infer<typeof graduationSchema>;
