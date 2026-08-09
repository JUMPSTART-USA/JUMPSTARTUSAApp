import { z } from 'zod';
import { CHAPTER_STATES } from '../chapters';
import { EMPLOYMENT_STATUSES, HIRING_STATUSES, US_STATES } from '../enums';
import {
  endNotBeforeStart,
  optionalDate,
  optionalEmail,
  optionalPhone,
  optionalTrimmed,
  positiveMoney,
  requiredTrimmed,
  uuid,
} from './common';

export const employerSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(300)),
  contactPerson: optionalTrimmed,
  phone: optionalPhone,
  email: optionalEmail,
  addressLine1: optionalTrimmed,
  city: optionalTrimmed,
  state: z.enum(US_STATES).optional(), // postal address state — NOT the chapter
  zip: optionalTrimmed,
  // Chapter (§7.2): optional at the pipe — the service stamps a scoped
  // creator's chapter and requires a pick from all-chapters users.
  chapterState: z.enum(CHAPTER_STATES).optional(),
  industry: optionalTrimmed,
  hiringStatus: z.enum(HIRING_STATUSES).default('prospect'),
  notes: optionalTrimmed,
});
export type EmployerInput = z.infer<typeof employerSchema>;

/**
 * Employment history is preserved, never overwritten (§6.9): a job change is
 * a NEW record; the API appends status changes to employment_status_history.
 */
export const employmentSchema = z
  .object({
    participantProfileId: uuid,
    employerId: uuid,
    jobTitle: requiredTrimmed.pipe(z.string().max(200)),
    startDate: optionalDate,
    endDate: optionalDate,
    status: z.enum(EMPLOYMENT_STATUSES).default('applied'),
    payRate: positiveMoney.optional(),
    payPeriod: z.enum(['hourly', 'weekly', 'annual']).default('hourly'),
    hoursPerWeek: z.coerce.number().int().min(1).max(168).optional(),
    supervisorName: optionalTrimmed,
    supervisorPhone: optionalPhone,
    notes: optionalTrimmed,
  })
  .superRefine(endNotBeforeStart('startDate', 'endDate'))
  .superRefine((val, ctx) => {
    const started = ['hired', 'active', 'terminated', 'resigned', 'completed'];
    if (started.includes(val.status) && !val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start date is required once a participant is hired',
        path: ['startDate'],
      });
    }
    const ended = ['terminated', 'resigned', 'completed'];
    if (ended.includes(val.status) && !val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date is required when employment has ended',
        path: ['endDate'],
      });
    }
  });
export type EmploymentInput = z.infer<typeof employmentSchema>;
