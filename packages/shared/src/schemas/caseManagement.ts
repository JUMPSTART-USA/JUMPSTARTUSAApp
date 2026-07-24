import { z } from 'zod';
import {
  CHECKLIST_ITEM_STATUSES,
  CONTACT_TYPES,
  GOAL_STATUSES,
  NOTE_CATEGORIES,
  TASK_STATUSES,
} from '../enums';
import {
  optionalDate,
  optionalTrimmed,
  requiredDate,
  requiredTrimmed,
  uuid,
} from './common';

export const caseNoteSchema = z
  .object({
    participantProfileId: uuid,
    noteDate: requiredDate,
    contactType: z.enum(CONTACT_TYPES),
    category: z.enum(NOTE_CATEGORIES),
    content: requiredTrimmed.pipe(z.string().max(50_000)),
    followUpRequired: z.boolean().default(false),
    followUpDate: optionalDate,
    confidential: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.followUpRequired && !val.followUpDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A follow-up date is required when follow-up is marked required',
        path: ['followUpDate'],
      });
    }
    if (val.noteDate > new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Note date cannot be in the future',
        path: ['noteDate'],
      });
    }
  });
export type CaseNoteInput = z.infer<typeof caseNoteSchema>;

export const caseServiceSchema = z.object({
  participantProfileId: uuid,
  serviceType: requiredTrimmed.pipe(z.string().max(100)),
  serviceDate: requiredDate,
  providerName: optionalTrimmed,
  description: optionalTrimmed,
  outcome: optionalTrimmed,
  followUpRequired: z.boolean().default(false),
  followUpDate: optionalDate,
  notes: optionalTrimmed,
});
export type CaseServiceInput = z.infer<typeof caseServiceSchema>;

export const checklistItemUpdateSchema = z.object({
  status: z.enum(CHECKLIST_ITEM_STATUSES),
  notes: optionalTrimmed,
});
export type ChecklistItemUpdateInput = z.infer<typeof checklistItemUpdateSchema>;

export const checklistTemplateSchema = z.object({
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
    .min(1, 'A checklist template needs at least one item'),
});
export type ChecklistTemplateInput = z.infer<typeof checklistTemplateSchema>;

export const servicePlanSchema = z.object({
  participantProfileId: uuid,
  title: z.string().trim().max(200).default('Service Plan'),
  status: z.enum(['active', 'completed', 'archived']).default('active'),
  reviewDate: optionalDate,
  notes: optionalTrimmed,
});
export type ServicePlanInput = z.infer<typeof servicePlanSchema>;

export const goalSchema = z.object({
  servicePlanId: uuid,
  category: z.enum(NOTE_CATEGORIES),
  description: requiredTrimmed.pipe(z.string().max(2000)),
  targetDate: optionalDate,
  status: z.enum(GOAL_STATUSES).default('not_started'),
  notes: optionalTrimmed,
});
export type GoalInput = z.infer<typeof goalSchema>;

export const goalMilestoneSchema = z.object({
  goalId: uuid,
  description: requiredTrimmed.pipe(z.string().max(1000)),
  dueDate: optionalDate,
});
export type GoalMilestoneInput = z.infer<typeof goalMilestoneSchema>;

export const caseTaskSchema = z.object({
  title: requiredTrimmed.pipe(z.string().max(300)),
  details: optionalTrimmed,
  assignedToId: uuid,
  dueDate: optionalDate,
  status: z.enum(TASK_STATUSES).default('open'),
  participantProfileId: uuid.optional(),
  goalId: uuid.optional(),
  outboundReferralId: uuid.optional(),
});
export type CaseTaskInput = z.infer<typeof caseTaskSchema>;

export const outboundReferralSchema = z
  .object({
    participantProfileId: uuid,
    vendorId: uuid.optional(),
    providerName: optionalTrimmed,
    reason: requiredTrimmed.pipe(z.string().max(2000)),
    referralDate: requiredDate,
    outcome: optionalTrimmed,
    notes: optionalTrimmed,
  })
  .superRefine((val, ctx) => {
    if (!val.vendorId && !val.providerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a partner organization or enter a provider name',
        path: ['providerName'],
      });
    }
  });
export type OutboundReferralInput = z.infer<typeof outboundReferralSchema>;

export const needsAssessmentSchema = z.object({
  participantProfileId: uuid,
  instrumentName: requiredTrimmed.pipe(z.string().max(200)),
  administeredAt: requiredDate,
  administeredByName: optionalTrimmed,
  domainScores: z.record(z.string(), z.number()).optional(),
  summary: optionalTrimmed,
});
export type NeedsAssessmentInput = z.infer<typeof needsAssessmentSchema>;
