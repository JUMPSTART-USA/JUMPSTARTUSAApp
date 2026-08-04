import { z } from 'zod';
import {
  ALUMNI_STATUSES,
  INSIDE_STATUSES,
  OUTSIDE_STATUSES,
  US_STATES,
} from '../enums';
import {
  clearableDate,
  clearableUuid,
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
