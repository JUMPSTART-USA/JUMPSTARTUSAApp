import { z } from 'zod';
import { CHAPTER_STATES } from '../chapters';
import {
  FINAL_ASSESSMENTS,
  HOME_GENDERS,
  HOUSING_EXIT_STATUSES,
  HOUSING_STATUSES,
} from '../enums';
import {
  optionalDate,
  optionalEmail,
  optionalPhone,
  optionalTrimmed,
  requiredDate,
  requiredTrimmed,
  uuid,
} from './common';

export const transitionalHomeSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(200)),
  addressLine1: optionalTrimmed,
  city: optionalTrimmed,
  // Home state IS the chapter (§7.2) — homes exist only in chapter states.
  state: z.enum(CHAPTER_STATES),
  zip: optionalTrimmed,
  phone: optionalPhone,
  houseManagerName: optionalTrimmed,
  houseManagerPhone: optionalPhone,
  houseManagerEmail: optionalEmail,
  capacity: z.coerce.number().int().positive('Capacity must be at least 1'),
  gender: z.enum(HOME_GENDERS).default('any'),
  sexOffenderApproved: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: optionalTrimmed,
});
export type TransitionalHomeInput = z.infer<typeof transitionalHomeSchema>;

/**
 * Housing business rules (§6.4):
 *  - any moved-out status ⇒ moveOutDate AND reasonForLeaving required
 *  - moveOutDate >= moveInDate
 * History preservation is structural: transfers close one enrollment and open
 * another — the API's transfer endpoint does both atomically.
 */
export const housingEnrollmentSchema = z
  .object({
    participantProfileId: uuid,
    homeId: uuid,
    moveInDate: requiredDate,
    moveOutDate: optionalDate,
    status: z.enum(HOUSING_STATUSES).default('active'),
    reasonForLeaving: optionalTrimmed,
    completionAssessment: z.enum(FINAL_ASSESSMENTS).optional(),
    assessmentNotes: optionalTrimmed,
    outsideProgramEnrollmentId: uuid.optional(),
    notes: optionalTrimmed,
  })
  .superRefine((val, ctx) => {
    const movedOut = (HOUSING_EXIT_STATUSES as readonly string[]).includes(val.status);
    if (movedOut) {
      if (!val.moveOutDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Move-out date is required when a resident moves out',
          path: ['moveOutDate'],
        });
      }
      if (!val.reasonForLeaving) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Reason for leaving is required when a resident moves out',
          path: ['reasonForLeaving'],
        });
      }
    }
    if (val.status === 'completed' && !val.completionAssessment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A completion assessment (Blue/Green/Yellow/Red) is required to mark completed — use "assessment pending" until it is in',
        path: ['completionAssessment'],
      });
    }
    if (val.moveOutDate && val.moveOutDate < val.moveInDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Move-out date cannot be before move-in date',
        path: ['moveOutDate'],
      });
    }
  });
export type HousingEnrollmentInput = z.infer<typeof housingEnrollmentSchema>;

/** Transfer: one action, two records — preserves history (§6.4). */
export const housingTransferSchema = z.object({
  fromEnrollmentId: uuid,
  toHomeId: uuid,
  transferDate: requiredDate,
  reason: requiredTrimmed,
  notes: optionalTrimmed,
});
export type HousingTransferInput = z.infer<typeof housingTransferSchema>;
