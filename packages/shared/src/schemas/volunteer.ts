import { z } from 'zod';
import { CHAPTER_STATES } from '../chapters';
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  BACKGROUND_CHECK_RESULTS,
  CLEARANCE_REQUIREMENT_TYPES,
  CLEARANCE_STATUSES,
  HOURS_SOURCES,
  HOURS_STATUSES,
  OPPORTUNITY_STATUSES,
  SHIFT_SIGNUP_STATUSES,
  VOLUNTEER_STATUSES,
} from '../enums';
import {
  clearableTrimmed,
  endNotBeforeStart,
  optionalDate,
  optionalTrimmed,
  requiredDate,
  requiredTrimmed,
  uuid,
} from './common';
import { personCorePartialSchema, personCoreSchema } from './person';

export const volunteerProfileFieldsSchema = z.object({
  status: z.enum(VOLUNTEER_STATUSES).default('applicant'),
  volunteerRoles: z.array(z.string().trim().max(100)).default([]),
  // Clearable on update: null = clear, undefined = no change.
  availability: clearableTrimmed,
  churchAffiliation: clearableTrimmed,
  notes: clearableTrimmed,
});

export const volunteerCreateSchema = z.object({
  person: personCoreSchema,
  profile: volunteerProfileFieldsSchema,
  // Chapter (§7.2): optional at the pipe — the service stamps a scoped
  // creator's chapter and requires a pick from all-chapters users.
  // person.state stays a mailing address, never the chapter.
  chapterState: z.enum(CHAPTER_STATES).optional(),
  confirmNotDuplicate: z.boolean().default(false),
});
export type VolunteerCreateInput = z.infer<typeof volunteerCreateSchema>;

export const volunteerUpdateSchema = z.object({
  person: personCorePartialSchema.optional(),
  profile: volunteerProfileFieldsSchema.partial().optional(),
});
export type VolunteerUpdateInput = z.infer<typeof volunteerUpdateSchema>;

export const volunteerAssignmentSchema = z
  .object({
    volunteerProfileId: uuid,
    assignmentType: z.enum(ASSIGNMENT_TYPES),
    institutionId: uuid.optional(),
    insideClassId: uuid.optional(),
    outsideProgramId: uuid.optional(),
    eventId: uuid.optional(),
    role: optionalTrimmed,
    startDate: requiredDate,
    endDate: optionalDate,
    status: z.enum(ASSIGNMENT_STATUSES).default('active'),
    notes: optionalTrimmed,
    /** Coordinator override when clearances are incomplete (soft-block, §6.6). */
    clearanceOverride: z.boolean().default(false),
    clearanceOverrideReason: optionalTrimmed,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'))
  .superRefine((val, ctx) => {
    if (val.assignmentType === 'inside_class' && !val.institutionId && !val.insideClassId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Inside assignments need an institution or inside class',
        path: ['institutionId'],
      });
    }
    if (val.clearanceOverride && !val.clearanceOverrideReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A reason is required to override missing clearances',
        path: ['clearanceOverrideReason'],
      });
    }
  });
export type VolunteerAssignmentInput = z.infer<typeof volunteerAssignmentSchema>;

/** Adjudication result only — never criminal-history detail (§7.4). */
export const backgroundCheckSchema = z
  .object({
    personId: uuid,
    vendor: requiredTrimmed.pipe(z.string().max(100)),
    package: optionalTrimmed,
    orderedAt: requiredDate,
    completedAt: optionalDate,
    result: z.enum(BACKGROUND_CHECK_RESULTS).default('pending'),
    expiresAt: optionalDate,
    notes: optionalTrimmed,
  })
  .superRefine(endNotBeforeStart('orderedAt', 'completedAt', 'Completed date cannot be before ordered date'));
export type BackgroundCheckInput = z.infer<typeof backgroundCheckSchema>;

export const volunteerTrainingSchema = z.object({
  volunteerProfileId: uuid,
  trainingType: requiredTrimmed.pipe(z.string().max(100)),
  completedAt: requiredDate,
  expiresAt: optionalDate,
  notes: optionalTrimmed,
});
export type VolunteerTrainingInput = z.infer<typeof volunteerTrainingSchema>;

export const clearanceRequirementSchema = z.object({
  institutionId: uuid,
  name: requiredTrimmed.pipe(z.string().max(200)),
  requirementType: z.enum(CLEARANCE_REQUIREMENT_TYPES),
  description: optionalTrimmed,
  renewalMonths: z.coerce.number().int().positive().optional(),
  hardBlock: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type ClearanceRequirementInput = z.infer<typeof clearanceRequirementSchema>;

export const volunteerClearanceSchema = z.object({
  volunteerProfileId: uuid,
  requirementId: uuid,
  status: z.enum(CLEARANCE_STATUSES).default('pending'),
  issuedAt: optionalDate,
  expiresAt: optionalDate,
  notes: optionalTrimmed,
});
export type VolunteerClearanceInput = z.infer<typeof volunteerClearanceSchema>;

// ── Volunteer engagement: opportunities, shifts & hours (§6.6) ──────────────

export const volunteerOpportunitySchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(200)),
  // Clearable on update: null = clear, undefined = no change.
  description: clearableTrimmed,
  // Chapter (§7.2): optional at the pipe — the service stamps a scoped
  // creator's chapter and requires a pick from all-chapters users.
  state: z.enum(CHAPTER_STATES).nullable().optional(),
  institutionId: uuid.nullable().optional(),
  outsideProgramId: uuid.nullable().optional(),
  eventId: uuid.nullable().optional(),
  location: clearableTrimmed,
  status: z.enum(OPPORTUNITY_STATUSES).default('open'),
  notes: clearableTrimmed,
});
export type VolunteerOpportunityInput = z.infer<typeof volunteerOpportunitySchema>;

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');

export const volunteerShiftSchema = z
  .object({
    shiftDate: requiredDate,
    startTime: timeOfDay,
    endTime: timeOfDay,
    capacity: z.coerce.number().int().positive().nullable().optional(),
    // Clearable on update: null = clear, undefined = no change.
    role: clearableTrimmed,
    location: clearableTrimmed,
    notes: clearableTrimmed,
  })
  .superRefine((val, ctx) => {
    if (val.startTime && val.endTime && val.endTime <= val.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time must be after start time',
        path: ['endTime'],
      });
    }
  });
export type VolunteerShiftInput = z.infer<typeof volunteerShiftSchema>;

export const shiftSignupSchema = z.object({
  volunteerProfileId: uuid,
  notes: optionalTrimmed,
});
export type ShiftSignupInput = z.infer<typeof shiftSignupSchema>;

export const shiftSignupUpdateSchema = z.object({
  status: z.enum(SHIFT_SIGNUP_STATUSES).optional(),
  notes: optionalTrimmed,
});
export type ShiftSignupUpdateInput = z.infer<typeof shiftSignupUpdateSchema>;

export const volunteerHoursSchema = z.object({
  volunteerProfileId: uuid,
  activityDate: requiredDate,
  hours: z.coerce
    .number()
    .positive('Hours must be positive')
    .max(24, 'A single entry cannot exceed 24 hours')
    .multipleOf(0.01),
  description: optionalTrimmed,
  opportunityId: uuid.nullable().optional(),
  shiftId: uuid.nullable().optional(),
  institutionId: uuid.nullable().optional(),
  assignmentId: uuid.nullable().optional(),
  source: z.enum(HOURS_SOURCES).default('staff'),
  status: z.enum(HOURS_STATUSES).default('approved'),
});
export type VolunteerHoursInput = z.infer<typeof volunteerHoursSchema>;
