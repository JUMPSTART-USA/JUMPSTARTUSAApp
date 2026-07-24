import { z } from 'zod';
import {
  CHECKIN_METHODS,
  CHECKIN_WAVES,
  ENGAGEMENT_TYPES,
  MENTOR_ASSIGNMENT_STATUSES,
  MENTOR_SCREENING_STAGES,
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
    employmentStatus: z
      .enum(['employed_ft', 'employed_pt', 'seeking', 'unable', 'unknown'])
      .optional(),
    housingStatus: z
      .enum(['stable', 'transitional', 'unstable', 'incarcerated', 'unknown'])
      .optional(),
    wellbeingFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    reArrested: z.boolean().optional(),
    reConvicted: z.boolean().optional(),
    reIncarcerated: z.boolean().optional(),
    justiceVerification: z.enum(VERIFICATION_LEVELS).optional(),
    justiceNotes: optionalTrimmed,
    notes: optionalTrimmed,
  })
  .superRefine((val, ctx) => {
    const anyJustice =
      val.reArrested !== undefined ||
      val.reConvicted !== undefined ||
      val.reIncarcerated !== undefined;
    if (anyJustice && !val.justiceVerification) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Record how justice-status was verified (self-reported / staff-verified / DOC-verified)',
        path: ['justiceVerification'],
      });
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
