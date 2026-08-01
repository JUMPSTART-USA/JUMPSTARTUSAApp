import { z } from 'zod';
import { MEETING_REQUEST_STATUSES, TRANSPORT_REQUEST_STATUSES } from '../enums';
import { optionalTrimmed, requiredDate, requiredTrimmed } from './common';

/**
 * Participant portal (tokenized links — no logins). The public forms and the
 * public API validate the SAME schemas, so a submission the form accepts is a
 * submission the API accepts.
 */

const timeOfDay = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time as HH:MM');

const notPast = (field: string) => (val: Date, ctx: z.RefinementCtx) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (val < today) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} cannot be in the past` });
  }
};

export const portalMessageSchema = z.object({
  subject: optionalTrimmed.pipe(z.string().max(200).optional()),
  body: requiredTrimmed.pipe(z.string().max(5000)),
});
export type PortalMessageInput = z.infer<typeof portalMessageSchema>;

export const meetingRequestSchema = z.object({
  preferredDate: requiredDate.superRefine(notPast('Preferred date')),
  preferredTime: timeOfDay.optional().or(z.literal('').transform(() => undefined)),
  reason: requiredTrimmed.pipe(z.string().max(2000)),
});
export type MeetingRequestInput = z.infer<typeof meetingRequestSchema>;

export const transportRequestSchema = z
  .object({
    tripDate: requiredDate.superRefine(notPast('Trip date')),
    tripTime: timeOfDay,
    destination: requiredTrimmed.pipe(z.string().max(300)),
    purpose: optionalTrimmed.pipe(z.string().max(1000).optional()),
    returnTripRequested: z.boolean().default(false),
    returnDate: requiredDate.optional(),
    returnTime: timeOfDay.optional().or(z.literal('').transform(() => undefined)),
    returnDestination: optionalTrimmed.pipe(z.string().max(300).optional()),
  })
  .superRefine((val, ctx) => {
    if (val.returnTripRequested) {
      if (!val.returnDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Return date is required for a return trip',
          path: ['returnDate'],
        });
      } else if (val.returnDate < val.tripDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Return date cannot be before the trip date',
          path: ['returnDate'],
        });
      }
      if (!val.returnTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Return time is required for a return trip',
          path: ['returnTime'],
        });
      }
      if (!val.returnDestination) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Return destination is required for a return trip',
          path: ['returnDestination'],
        });
      }
    }
  });
export type TransportRequestInput = z.infer<typeof transportRequestSchema>;

// Staff review actions
export const meetingDecisionSchema = z.object({
  status: z.enum(MEETING_REQUEST_STATUSES),
  scheduledFor: requiredDate.optional(),
  decisionNotes: optionalTrimmed,
});
export type MeetingDecisionInput = z.infer<typeof meetingDecisionSchema>;

export const transportDecisionSchema = z.object({
  status: z.enum(TRANSPORT_REQUEST_STATUSES),
  assignedVehicleId: z.string().uuid().optional(),
  decisionNotes: optionalTrimmed,
});
export type TransportDecisionInput = z.infer<typeof transportDecisionSchema>;
