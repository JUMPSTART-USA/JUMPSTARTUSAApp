import { z } from 'zod';
import {
  ALUMNI_STATUSES,
  INSIDE_STATUSES,
  OUTSIDE_STATUSES,
  US_STATES,
} from '../enums';
import { optionalDate, optionalTrimmed, uuid } from './common';
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
});

/** Create = person fields + profile fields in one submission. */
export const participantCreateSchema = z.object({
  person: personCoreSchema,
  profile: participantProfileFieldsSchema,
  /** Set true to skip the duplicate-candidate check after reviewing matches. */
  confirmNotDuplicate: z.boolean().default(false),
});
export type ParticipantCreateInput = z.infer<typeof participantCreateSchema>;

export const participantUpdateSchema = z.object({
  person: personCorePartialSchema.optional(),
  profile: participantProfileFieldsSchema.partial().optional(),
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
