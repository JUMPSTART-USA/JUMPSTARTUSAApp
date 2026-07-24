import { z } from 'zod';
import {
  CHECKIN_METHODS,
  CHECKIN_WAVES,
  ENGAGEMENT_TYPES,
  MENTOR_ASSIGNMENT_STATUSES,
  MENTOR_SCREENING_STAGES,
  OUTCOME_EMPLOYMENT_STATUSES,
  OUTCOME_HOUSING_STATUSES,
  SESSION_MODES,
  VERIFICATION_LEVELS,
} from '../enums';
import {
  optionalDate,
  optionalTrimmed,
  requiredDate,
  requiredTrimmed,
  uuid,
} from './common';

export const alumniEngagementSchema = z.object({
  participantProfileId: uuid,
  engagementType: z.enum(ENGAGEMENT_TYPES),
  engagementDate: requiredDate,
  notes: optionalTrimmed,
});
export type AlumniEngagementInput = z.infer<typeof alumniEngagementSchema>;

export const outcomeCheckinCompleteSchema = z
  .object({
    completedDate: requiredDate,
    method: z.enum(CHECKIN_METHODS),
    employmentStatus: z.enum(OUTCOME_EMPLOYMENT_STATUSES).optional(),
    housingStatus: z.enum(OUTCOME_HOUSING_STATUSES).optional(),
    wellbeingFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    // Verification level is PER FIELD (§9.3): re-arrest may be self-reported
    // while re-incarceration is DOC-verified on the same check-in.
    reArrested: z.boolean().optional(),
    reArrestedVerification: z.enum(VERIFICATION_LEVELS).optional(),
    reConvicted: z.boolean().optional(),
    reConvictedVerification: z.enum(VERIFICATION_LEVELS).optional(),
    reIncarcerated: z.boolean().optional(),
    reIncarceratedVerification: z.enum(VERIFICATION_LEVELS).optional(),
    justiceNotes: optionalTrimmed,
    notes: optionalTrimmed,
  })
  .superRefine((val, ctx) => {
    const pairs = [
      ['reArrested', 'reArrestedVerification'],
      ['reConvicted', 'reConvictedVerification'],
      ['reIncarcerated', 'reIncarceratedVerification'],
    ] as const;
    for (const [field, verification] of pairs) {
      if (val[field] !== undefined && !val[verification]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Record how this was verified (self-reported / staff-verified / DOC-verified)',
          path: [verification],
        });
      }
    }
  });
export type OutcomeCheckinCompleteInput = z.infer<typeof outcomeCheckinCompleteSchema>;

export const outcomeCheckinScheduleSchema = z.object({
  participantProfileId: uuid,
  wave: z.enum(CHECKIN_WAVES),
  dueDate: requiredDate,
});
export type OutcomeCheckinScheduleInput = z.infer<typeof outcomeCheckinScheduleSchema>;

export const mentorScreeningSchema = z.object({
  volunteerProfileId: uuid,
  stage: z.enum(MENTOR_SCREENING_STAGES).default('applied'),
  conditions: optionalTrimmed,
  notes: optionalTrimmed,
});
export type MentorScreeningInput = z.infer<typeof mentorScreeningSchema>;

export const mentorScreeningStepSchema = z.object({
  stage: z.enum(MENTOR_SCREENING_STAGES),
  outcome: z.enum(['passed', 'failed', 'waived', 'pending']),
  completedAt: optionalDate,
  notes: optionalTrimmed,
});
export type MentorScreeningStepInput = z.infer<typeof mentorScreeningStepSchema>;

export const mentorAssignmentSchema = z.object({
  mentorProfileId: uuid,
  participantProfileId: uuid,
  startDate: optionalDate,
  status: z.enum(MENTOR_ASSIGNMENT_STATUSES).default('proposed'),
  matchRationale: optionalTrimmed,
  meetingCadence: optionalTrimmed,
});
export type MentorAssignmentInput = z.infer<typeof mentorAssignmentSchema>;

export const mentorAssignmentEndSchema = z.object({
  endDate: requiredDate,
  endReason: requiredTrimmed.pipe(z.string().max(1000)),
});
export type MentorAssignmentEndInput = z.infer<typeof mentorAssignmentEndSchema>;

/** §6.7: pausing, like ending, requires a reason. */
export const mentorAssignmentPauseSchema = z.object({
  pauseReason: requiredTrimmed.pipe(z.string().max(1000)),
});
export type MentorAssignmentPauseInput = z.infer<typeof mentorAssignmentPauseSchema>;

/** Admin-editable screening-criteria template (mirrors onboarding checklists). */
export const mentorScreeningTemplateSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(200)),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
  items: z
    .array(
      z.object({
        label: requiredTrimmed.pipe(z.string().max(300)),
        sortOrder: z.number().int().min(0),
        required: z.boolean().default(true),
      }),
    )
    .min(1, 'A screening template needs at least one criterion'),
});
export type MentorScreeningTemplateInput = z.infer<typeof mentorScreeningTemplateSchema>;

export const mentorScreeningCriterionUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'not_applicable']),
  notes: optionalTrimmed,
});
export type MentorScreeningCriterionUpdateInput = z.infer<
  typeof mentorScreeningCriterionUpdateSchema
>;

export const mentorSessionLogSchema = z.object({
  mentorAssignmentId: uuid,
  sessionDate: requiredDate,
  mode: z.enum(SESSION_MODES),
  durationMinutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
  participantProgress: z.enum(['improving', 'steady', 'struggling']).optional(),
  concernsEscalated: z.boolean().default(false),
  notes: optionalTrimmed,
});
export type MentorSessionLogInput = z.infer<typeof mentorSessionLogSchema>;
