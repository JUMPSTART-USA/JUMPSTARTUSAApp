import { z } from 'zod';
import {
  CLASS_STATUSES,
  ENROLLMENT_STATUSES,
  FINAL_ASSESSMENTS,
  INSIDE_CLASS_TYPES,
  PROGRAM_TYPES,
  US_STATES,
} from '../enums';
import {
  endNotBeforeStart,
  optionalDate,
  optionalEmail,
  optionalPhone,
  optionalTrimmed,
  requiredDate,
  requiredTrimmed,
  uuid,
} from './common';

// ── Institutions ────────────────────────────────────────────────────────────

export const institutionSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(200)),
  institutionType: optionalTrimmed,
  addressLine1: optionalTrimmed,
  city: optionalTrimmed,
  state: z.enum(US_STATES),
  zip: optionalTrimmed,
  mainPhone: optionalPhone,
  chaplainName: optionalTrimmed,
  chaplainPhone: optionalPhone,
  chaplainEmail: optionalEmail,
  primaryContactName: optionalTrimmed,
  primaryContactRole: optionalTrimmed,
  primaryContactPhone: optionalPhone,
  primaryContactEmail: optionalEmail,
  notes: optionalTrimmed,
  active: z.boolean().default(true),
});
export type InstitutionInput = z.infer<typeof institutionSchema>;

// ── Inside classes ──────────────────────────────────────────────────────────

export const insideClassSchema = z
  .object({
    institutionId: uuid,
    name: requiredTrimmed.pipe(z.string().max(200)),
    classType: z.enum(INSIDE_CLASS_TYPES).optional(),
    startDate: requiredDate,
    endDate: optionalDate,
    status: z.enum(CLASS_STATUSES).default('planned'),
    staffLeadId: uuid.optional(),
    notes: optionalTrimmed,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));
export type InsideClassInput = z.infer<typeof insideClassSchema>;

/**
 * Shared enrollment business rules (§6.2, enforced for BOTH inside and
 * outside enrollments):
 *  - left_early ⇒ leftEarlyDate AND leftEarlyReason required
 *  - completed ⇒ finalAssessment required (use assessment_pending while
 *    assessments are still coming in)
 *  - completionDate cannot precede enrollmentDate
 */
function enrollmentRules(val: {
  status: (typeof ENROLLMENT_STATUSES)[number];
  enrollmentDate: Date;
  completionDate?: Date;
  leftEarlyDate?: Date;
  leftEarlyReason?: string;
  finalAssessment?: (typeof FINAL_ASSESSMENTS)[number];
}, ctx: z.RefinementCtx, assessmentPath = 'finalAssessment') {
  if (val.status === 'left_early') {
    if (!val.leftEarlyDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date left is required when a participant leaves early',
        path: ['leftEarlyDate'],
      });
    }
    if (!val.leftEarlyReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reason for leaving is required when a participant leaves early',
        path: ['leftEarlyReason'],
      });
    }
  }
  if (val.status === 'completed' && !val.finalAssessment) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'A final assessment (Blue/Green/Yellow/Red) is required to mark completed — use "assessment pending" until it is in',
      path: [assessmentPath],
    });
  }
  if (val.completionDate && val.completionDate < val.enrollmentDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Completion date cannot be before enrollment date',
      path: ['completionDate'],
    });
  }
  if (val.leftEarlyDate && val.leftEarlyDate < val.enrollmentDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Left-early date cannot be before enrollment date',
      path: ['leftEarlyDate'],
    });
  }
}

const enrollmentBase = {
  participantProfileId: uuid,
  enrollmentDate: requiredDate,
  status: z.enum(ENROLLMENT_STATUSES).default('enrolled'),
  completionDate: optionalDate,
  leftEarlyDate: optionalDate,
  leftEarlyReason: optionalTrimmed,
  finalAssessment: z.enum(FINAL_ASSESSMENTS).optional(),
  assessmentNotes: optionalTrimmed,
  notes: optionalTrimmed,
};

export const insideEnrollmentSchema = z
  .object({ ...enrollmentBase, insideClassId: uuid })
  .superRefine(enrollmentRules);
export type InsideEnrollmentInput = z.infer<typeof insideEnrollmentSchema>;

/** Batch enrollment: classes enroll 10–30 people at once (§6.2). */
export const batchEnrollSchema = z.object({
  insideClassId: uuid,
  participantProfileIds: z.array(uuid).min(1).max(200),
  enrollmentDate: requiredDate,
});
export type BatchEnrollInput = z.infer<typeof batchEnrollSchema>;

/** Close-out roster row: walk the roster in one grid (§6.2 workflows). */
export const closeOutRowSchema = z
  .object({
    enrollmentId: uuid,
    status: z.enum(['completed', 'assessment_pending', 'left_early', 'removed', 'transferred']),
    completionDate: optionalDate,
    leftEarlyDate: optionalDate,
    leftEarlyReason: optionalTrimmed,
    finalAssessment: z.enum(FINAL_ASSESSMENTS).optional(),
    assessmentNotes: optionalTrimmed,
  })
  .superRefine((val, ctx) => {
    if (val.status === 'left_early' && (!val.leftEarlyDate || !val.leftEarlyReason)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Left-early rows need both a date and a reason',
        path: ['leftEarlyReason'],
      });
    }
    if (val.status === 'completed' && !val.finalAssessment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Completed rows need a Blue/Green/Yellow/Red assessment',
        path: ['finalAssessment'],
      });
    }
  });

export const classCloseOutSchema = z.object({
  rows: z.array(closeOutRowSchema).min(1),
});
export type ClassCloseOutInput = z.infer<typeof classCloseOutSchema>;

// ── Outside programs ────────────────────────────────────────────────────────

export const outsideProgramSchema = z
  .object({
    name: requiredTrimmed.pipe(z.string().max(200)),
    programType: z.enum(PROGRAM_TYPES),
    location: optionalTrimmed,
    state: z.enum(US_STATES).optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    recurringSchedule: optionalTrimmed,
    staffLeadId: uuid.optional(),
    volunteerLeadName: optionalTrimmed,
    capacity: z.coerce.number().int().positive().optional(),
    status: z.enum(['active', 'inactive', 'completed']).default('active'),
    notes: optionalTrimmed,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));
export type OutsideProgramInput = z.infer<typeof outsideProgramSchema>;

/**
 * Outside enrollments name the assessment `completionAssessment` (matching the
 * requirements' field list and the Prisma column) — same rules as inside.
 */
export const outsideEnrollmentSchema = z
  .object({
    participantProfileId: uuid,
    outsideProgramId: uuid,
    enrollmentDate: requiredDate,
    status: z.enum(ENROLLMENT_STATUSES).default('enrolled'),
    completionDate: optionalDate,
    leftEarlyDate: optionalDate,
    leftEarlyReason: optionalTrimmed,
    completionAssessment: z.enum(FINAL_ASSESSMENTS).optional(),
    assessmentNotes: optionalTrimmed,
    notes: optionalTrimmed,
  })
  .superRefine((val, ctx) =>
    enrollmentRules(
      {
        status: val.status,
        enrollmentDate: val.enrollmentDate,
        completionDate: val.completionDate,
        leftEarlyDate: val.leftEarlyDate,
        leftEarlyReason: val.leftEarlyReason,
        finalAssessment: val.completionAssessment,
      },
      ctx,
      'completionAssessment',
    ),
  );
export type OutsideEnrollmentInput = z.infer<typeof outsideEnrollmentSchema>;
