import { z } from 'zod';
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  BACKGROUND_CHECK_RESULTS,
  CLEARANCE_REQUIREMENT_TYPES,
  CLEARANCE_STATUSES,
  VOLUNTEER_STATUSES,
} from '../enums';
import {
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
  availability: optionalTrimmed,
  churchAffiliation: optionalTrimmed,
  notes: optionalTrimmed,
});

export const volunteerCreateSchema = z.object({
  person: personCoreSchema,
  profile: volunteerProfileFieldsSchema,
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
