import { z } from 'zod';
import { DONOR_TYPES, US_STATES } from '../enums';
import {
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

// Donors/donations are a Bloomerang mirror — the platform only edits local
// fields (person link, local notes, campaign/event links). These schemas
// cover manual entry paths (e.g., historical import fixes) and local links.

export const donorSchema = z.object({
  donorType: z.enum(DONOR_TYPES).default('individual'),
  name: requiredTrimmed.pipe(z.string().max(300)),
  contactPerson: optionalTrimmed,
  phone: optionalPhone,
  email: optionalEmail,
  addressLine1: optionalTrimmed,
  city: optionalTrimmed,
  state: z.enum(US_STATES).optional(),
  zip: optionalTrimmed,
  status: z.enum(['active', 'lapsed', 'inactive']).default('active'),
  personId: uuid.optional(),
  notes: optionalTrimmed,
});
export type DonorInput = z.infer<typeof donorSchema>;

export const donationSchema = z.object({
  donorId: uuid,
  donationDate: requiredDate,
  amount: positiveMoney, // requirements: donation amount must be positive
  paymentMethod: optionalTrimmed,
  fund: optionalTrimmed,
  isRecurring: z.boolean().default(false),
  receiptSent: z.boolean().default(false),
  campaignId: uuid.optional(),
  eventId: uuid.optional(),
  notes: optionalTrimmed,
});
export type DonationInput = z.infer<typeof donationSchema>;

export const campaignSchema = z
  .object({
    name: requiredTrimmed.pipe(z.string().max(200)),
    description: optionalTrimmed,
    startDate: optionalDate,
    endDate: optionalDate,
    goalAmount: positiveMoney.optional(),
    status: z.enum(['planned', 'active', 'completed', 'canceled']).default('active'),
    notes: optionalTrimmed,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));
export type CampaignInput = z.infer<typeof campaignSchema>;

export const eventSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(200)),
  eventType: optionalTrimmed,
  eventDate: requiredDate,
  location: optionalTrimmed,
  campaignId: uuid.optional(),
  description: optionalTrimmed,
  attendanceCount: z.coerce.number().int().min(0).optional(),
  revenue: nonNegativeMoney.optional(),
  expenses: nonNegativeMoney.optional(),
  notes: optionalTrimmed,
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
  contactPerson: optionalTrimmed,
  phone: optionalPhone,
  email: optionalEmail,
  addressLine1: optionalTrimmed,
  city: optionalTrimmed,
  state: z.enum(US_STATES).optional(),
  zip: optionalTrimmed,
  servicesProvided: optionalTrimmed,
  isReferralPartner: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: optionalTrimmed,
});
export type VendorInput = z.infer<typeof vendorSchema>;
