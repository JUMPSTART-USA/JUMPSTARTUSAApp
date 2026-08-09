import { z } from 'zod';
import { CHAPTER_STATES } from '../chapters';
import {
  DONOR_TASK_STATUSES,
  DONOR_TYPES,
  GIFT_FREQUENCIES,
  INTERACTION_CHANNELS,
  INTERACTION_PURPOSES,
  PLEDGE_STATUSES,
  RECURRING_GIFT_STATUSES,
  TRIBUTE_TYPES,
  US_STATES,
} from '../enums';
import {
  clearableDate,
  clearableTrimmed,
  clearableUuid,
  endNotBeforeStart,
  nonNegativeMoney,
  optionalDate,
  optionalEmail,
  optionalPhone,
  optionalTrimmed,
  positiveMoney,
  requiredDate,
  requiredTrimmed,
  uuid,
} from './common';

// Clearable variants (null = clear the column, undefined = no change) composed
// from the optional* helpers so email/phone format validation stays identical.
// ZodNullable short-circuits on null before the inner preprocess/coercion runs,
// so null never reaches the format checks. PATCH bodies are spread into
// prisma.update, where null writes NULL — exactly the "clear" semantics the
// edit dialogs rely on.
const clearableEmail = optionalEmail.nullable();
const clearablePhone = optionalPhone.nullable();
const clearableState = z.enum(US_STATES).nullable().optional();

// Chapter assignment (§7.2, docs/chapter-scoping.md): optional at the pipe —
// the service stamps a chapter-scoped creator's own chapter and rejects
// creates from all-chapters users that omit it (resolveCreateChapter).
const chapterState = z.enum(CHAPTER_STATES).optional();

// Native Development (donor management) schemas — the platform is the system
// of record for donors, giving, campaigns and events (§6.8). Aggregates
// (lifetime giving, raised-to-date, pledge balances) are computed API-side.

// Payment methods are a UI vocabulary, not a database enum — historical
// imports may carry other values, so the column stays a free string.
export const PAYMENT_METHOD_OPTIONS = [
  'cash',
  'check',
  'credit_card',
  'ach_eft',
  'apple_pay',
  'google_pay',
  'paypal',
  'venmo',
  'in_kind',
  'other',
] as const;
export type PaymentMethodOption = (typeof PAYMENT_METHOD_OPTIONS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodOption, string> = {
  cash: 'Cash',
  check: 'Check',
  credit_card: 'Credit card',
  ach_eft: 'ACH / EFT',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  paypal: 'PayPal',
  venmo: 'Venmo',
  in_kind: 'In-kind',
  other: 'Other',
};

export const donorSchema = z.object({
  donorType: z.enum(DONOR_TYPES).default('individual'),
  name: requiredTrimmed.pipe(z.string().max(300)),
  contactPerson: clearableTrimmed,
  phone: clearablePhone,
  email: clearableEmail,
  addressLine1: clearableTrimmed,
  city: clearableTrimmed,
  state: clearableState, // postal address state — NOT the chapter
  zip: clearableTrimmed,
  chapterState,
  status: z.enum(['active', 'lapsed', 'inactive']).default('active'),
  personId: clearableUuid, // null = unlink the person
  householdId: uuid.nullable().optional(), // null = remove from household
  isHeadOfHousehold: z.boolean().default(false),
  notes: clearableTrimmed,
});
export type DonorInput = z.infer<typeof donorSchema>;

// Create-only wrapper: the duplicate-person check flag rides the payload but
// is not a donor column (§5 — individual donors are often existing
// participants/volunteers; the API surfaces matches so staff link instead of
// creating a disconnected record).
export const donorCreateSchema = donorSchema.extend({
  confirmNotDuplicate: z.boolean().default(false),
});
export type DonorCreateInput = z.infer<typeof donorCreateSchema>;

export const householdSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(300)),
  envelopeName: optionalTrimmed,
  notes: optionalTrimmed,
  chapterState,
});
export type HouseholdInput = z.infer<typeof householdSchema>;

export const donorRelationshipSchema = z.object({
  relatedDonorId: uuid,
  relationshipType: requiredTrimmed.pipe(z.string().max(100)),
  reciprocalType: optionalTrimmed,
  notes: optionalTrimmed,
});
export type DonorRelationshipInput = z.infer<typeof donorRelationshipSchema>;

export const fundSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(200)),
  description: clearableTrimmed,
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});
export type FundInput = z.infer<typeof fundSchema>;

export const appealSchema = z
  .object({
    name: requiredTrimmed.pipe(z.string().max(200)),
    description: clearableTrimmed,
    campaignId: uuid.nullable().optional(),
    goalAmount: positiveMoney.nullable().optional(),
    startDate: clearableDate,
    endDate: clearableDate,
    isActive: z.boolean().default(true),
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));
export type AppealInput = z.infer<typeof appealSchema>;

export const donationSchema = z
  .object({
    donorId: uuid,
    donationDate: requiredDate,
    amount: positiveMoney, // requirements: donation amount must be positive
    paymentMethod: clearableTrimmed,
    isRecurring: z.boolean().default(false),
    receiptSent: z.boolean().default(false),
    fundId: uuid.nullable().optional(),
    campaignId: uuid.nullable().optional(),
    appealId: uuid.nullable().optional(),
    eventId: uuid.nullable().optional(),
    pledgeId: uuid.nullable().optional(),
    recurringGiftId: uuid.nullable().optional(),
    tributeType: z.enum(TRIBUTE_TYPES).nullable().optional(),
    tributeName: clearableTrimmed,
    tributeNotify: clearableTrimmed,
    isAnonymous: z.boolean().default(false),
    nonDeductibleAmount: nonNegativeMoney.nullable().optional(),
    inKindDescription: clearableTrimmed,
    inKindFairMarketValue: nonNegativeMoney.nullable().optional(),
    notes: clearableTrimmed,
  })
  .superRefine((val, ctx) => {
    if (val.tributeType && !val.tributeName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter who this gift honors',
        path: ['tributeName'],
      });
    }
    if (!val.tributeType && val.tributeName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose in honor or in memory',
        path: ['tributeType'],
      });
    }
    if (
      val.nonDeductibleAmount !== undefined &&
      val.nonDeductibleAmount !== null &&
      val.amount !== undefined &&
      Number(val.nonDeductibleAmount) > Number(val.amount)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cannot exceed the gift amount',
        path: ['nonDeductibleAmount'],
      });
    }
  });
export type DonationInput = z.infer<typeof donationSchema>;

export const acknowledgeDonationSchema = z.object({
  channel: z.enum(INTERACTION_CHANNELS).default('mail'),
  sendReceipt: z.boolean().default(false),
  notes: optionalTrimmed,
});
export type AcknowledgeDonationInput = z.infer<typeof acknowledgeDonationSchema>;

export const softCreditSchema = z.object({
  donorId: uuid,
  amount: positiveMoney,
  notes: optionalTrimmed,
});
export type SoftCreditInput = z.infer<typeof softCreditSchema>;

export const pledgeSchema = z
  .object({
    donorId: uuid,
    pledgeDate: requiredDate,
    totalAmount: positiveMoney,
    installmentAmount: positiveMoney.nullable().optional(),
    frequency: z.enum(GIFT_FREQUENCIES).nullable().optional(),
    startDate: clearableDate,
    endDate: clearableDate,
    campaignId: uuid.nullable().optional(),
    fundId: uuid.nullable().optional(),
    appealId: uuid.nullable().optional(),
    status: z.enum(PLEDGE_STATUSES).default('active'),
    writtenOffAmount: nonNegativeMoney.nullable().optional(),
    notes: clearableTrimmed,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'))
  .superRefine((val, ctx) => {
    if (
      val.installmentAmount !== undefined &&
      val.installmentAmount !== null &&
      val.totalAmount !== undefined &&
      Number(val.installmentAmount) > Number(val.totalAmount)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Installment cannot exceed the pledge total',
        path: ['installmentAmount'],
      });
    }
    if (val.status === 'written_off' && val.writtenOffAmount == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the amount being written off',
        path: ['writtenOffAmount'],
      });
    }
  });
export type PledgeInput = z.infer<typeof pledgeSchema>;

export const recurringGiftSchema = z
  .object({
    donorId: uuid,
    amount: positiveMoney,
    frequency: z.enum(GIFT_FREQUENCIES),
    startDate: requiredDate,
    endDate: clearableDate,
    nextGiftDate: clearableDate,
    paymentMethod: clearableTrimmed,
    campaignId: uuid.nullable().optional(),
    fundId: uuid.nullable().optional(),
    appealId: uuid.nullable().optional(),
    status: z.enum(RECURRING_GIFT_STATUSES).default('active'),
    notes: clearableTrimmed,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));
export type RecurringGiftInput = z.infer<typeof recurringGiftSchema>;

// Records a payment against a pledge or recurring gift — the API creates a
// linked Donation inheriting the schedule's designations unless overridden.
export const schedulePaymentSchema = z.object({
  donationDate: requiredDate,
  amount: positiveMoney,
  paymentMethod: optionalTrimmed,
  fundId: uuid.nullable().optional(),
  campaignId: uuid.nullable().optional(),
  appealId: uuid.nullable().optional(),
  receiptSent: z.boolean().default(false),
  notes: optionalTrimmed,
});
export type SchedulePaymentInput = z.infer<typeof schedulePaymentSchema>;

export const donorInteractionSchema = z.object({
  donorId: uuid,
  date: requiredDate,
  channel: z.enum(INTERACTION_CHANNELS),
  purpose: z.enum(INTERACTION_PURPOSES),
  subject: requiredTrimmed.pipe(z.string().max(300)),
  notes: clearableTrimmed,
  isInbound: z.boolean().default(false),
});
export type DonorInteractionInput = z.infer<typeof donorInteractionSchema>;

export const donorTaskSchema = z.object({
  donorId: uuid,
  assignedToId: uuid.nullable().optional(),
  subject: requiredTrimmed.pipe(z.string().max(300)),
  dueDate: optionalDate,
  status: z.enum(DONOR_TASK_STATUSES).default('open'),
  channel: z.enum(INTERACTION_CHANNELS).nullable().optional(),
  purpose: z.enum(INTERACTION_PURPOSES).nullable().optional(),
  notes: optionalTrimmed,
});
export type DonorTaskInput = z.infer<typeof donorTaskSchema>;

export const campaignSchema = z
  .object({
    name: requiredTrimmed.pipe(z.string().max(200)),
    description: clearableTrimmed,
    startDate: clearableDate,
    endDate: clearableDate,
    goalAmount: positiveMoney.nullable().optional(),
    status: z.enum(['planned', 'active', 'completed', 'canceled']).default('active'),
    notes: clearableTrimmed,
    chapterState,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));
export type CampaignInput = z.infer<typeof campaignSchema>;

export const eventSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(200)),
  eventType: clearableTrimmed,
  eventDate: requiredDate,
  location: clearableTrimmed,
  chapterState,
  campaignId: clearableUuid,
  description: clearableTrimmed,
  attendanceCount: z.coerce.number().int().min(0).nullable().optional(),
  revenue: nonNegativeMoney.nullable().optional(),
  expenses: nonNegativeMoney.nullable().optional(),
  notes: clearableTrimmed,
});
export type EventInput = z.infer<typeof eventSchema>;

export const eventRegistrationSchema = z
  .object({
    eventId: uuid,
    personId: uuid.optional(),
    externalName: optionalTrimmed,
    externalEmail: optionalEmail,
    status: z.enum(['registered', 'attended', 'no_show', 'canceled']).default('registered'),
    notes: optionalTrimmed,
  })
  .superRefine((val, ctx) => {
    if (!val.personId && !val.externalName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a person or enter a guest name',
        path: ['externalName'],
      });
    }
  });
export type EventRegistrationInput = z.infer<typeof eventRegistrationSchema>;

export const vendorSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(300)),
  contactPerson: clearableTrimmed,
  phone: clearablePhone,
  email: clearableEmail,
  addressLine1: clearableTrimmed,
  city: clearableTrimmed,
  state: clearableState, // postal address state — NOT the chapter
  zip: clearableTrimmed,
  chapterState,
  servicesProvided: clearableTrimmed,
  isReferralPartner: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: clearableTrimmed,
});
export type VendorInput = z.infer<typeof vendorSchema>;
