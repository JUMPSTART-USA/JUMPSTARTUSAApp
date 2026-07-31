import { z } from 'zod';
import {
  BUDGET_CATEGORIES,
  BUDGET_FREQUENCIES,
  CHECKLIST_ITEM_STATUSES,
  CONTACT_TYPES,
  GOAL_STATUSES,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  NOTE_CATEGORIES,
  TASK_STATUSES,
} from '../enums';
import {
  endNotBeforeStart,
  optionalDate,
  optionalTrimmed,
  positiveMoney,
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

// ── Participant budgets (§6.6) ──────────────────────────────────────────────

export const budgetItemSchema = z
  .object({
    participantProfileId: uuid,
    category: z.enum(BUDGET_CATEGORIES),
    label: optionalTrimmed,
    amount: positiveMoney,
    frequency: z.enum(BUDGET_FREQUENCIES),
    startDate: requiredDate,
    endDate: optionalDate,
    active: z.boolean().default(true),
    notes: optionalTrimmed,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));
export type BudgetItemInput = z.infer<typeof budgetItemSchema>;

export const budgetPaymentSchema = z
  .object({
    budgetItemId: uuid,
    paidDate: requiredDate,
    amount: positiveMoney,
    method: optionalTrimmed,
    notes: optionalTrimmed,
  })
  .superRefine((val, ctx) => {
    if (val.paidDate > new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Payment date cannot be in the future',
        path: ['paidDate'],
      });
    }
  });
export type BudgetPaymentInput = z.infer<typeof budgetPaymentSchema>;

// ── Travel-away requests (§6.7) ─────────────────────────────────────────────

export const travelRequestSchema = z
  .object({
    participantProfileId: uuid,
    startDate: requiredDate,
    endDate: requiredDate,
    destination: requiredTrimmed.pipe(z.string().max(300)),
    purpose: requiredTrimmed.pipe(z.string().max(2000)),
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));
export type TravelRequestInput = z.infer<typeof travelRequestSchema>;

/** Approve/deny (case_management.update). Canceling uses status 'canceled'. */
export const travelDecisionSchema = z.object({
  status: z.enum(['approved', 'denied', 'canceled']),
  decisionNotes: optionalTrimmed,
});
export type TravelDecisionInput = z.infer<typeof travelDecisionSchema>;

// ── Incident reports (§6.8) ─────────────────────────────────────────────────

export const incidentReportSchema = z
  .object({
    participantProfileId: uuid,
    incidentDate: requiredDate,
    category: z.enum(INCIDENT_CATEGORIES),
    severity: z.enum(INCIDENT_SEVERITIES),
    description: requiredTrimmed.pipe(z.string().max(5000)),
    actionTaken: optionalTrimmed,
    status: z.enum(INCIDENT_STATUSES).default('open'),
    resolutionNotes: optionalTrimmed,
  })
  .superRefine((val, ctx) => {
    if (val.incidentDate > new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Incident date cannot be in the future',
        path: ['incidentDate'],
      });
    }
  });
export type IncidentReportInput = z.infer<typeof incidentReportSchema>;
