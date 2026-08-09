import { z } from 'zod';
import { CHAPTER_STATES } from '../chapters';
import { COMM_CHANNELS } from '../enums';
import { optionalTrimmed, requiredTrimmed, uuid } from './common';

export const communicationTemplateSchema = z
  .object({
    name: requiredTrimmed.pipe(z.string().max(200)),
    channel: z.enum(COMM_CHANNELS),
    subject: optionalTrimmed,
    body: requiredTrimmed.pipe(z.string().max(100_000)),
    active: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.channel === 'email' && !val.subject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email templates need a subject line',
        path: ['subject'],
      });
    }
    // No confidential content by SMS — templates enforced (§6.12). SMS length
    // is a practical guard, not a security control.
    if (val.channel === 'sms' && val.body.length > 640) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SMS templates are limited to 640 characters',
        path: ['body'],
      });
    }
  });
export type CommunicationTemplateInput = z.infer<typeof communicationTemplateSchema>;

export const sendCommunicationSchema = z
  .object({
    personId: uuid,
    channel: z.enum(COMM_CHANNELS),
    templateId: uuid.optional(),
    subject: optionalTrimmed,
    body: optionalTrimmed,
    relatedEntityType: optionalTrimmed,
    relatedEntityId: uuid.optional(),
    // Chapter (§7.2): optional at the pipe — the service stamps the sender's
    // chapter or the recipient's derived chapter, and only needs an explicit
    // pick from an all-chapters sender when the recipient has neither.
    chapterState: z.enum(CHAPTER_STATES).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.templateId && !val.body) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose a template or write a message',
        path: ['body'],
      });
    }
  });
export type SendCommunicationInput = z.infer<typeof sendCommunicationSchema>;

/** Returned-mail logging (§6.12): flips a sent letter to status 'returned'. */
export const markReturnedSchema = z.object({
  note: optionalTrimmed,
});
export type MarkReturnedInput = z.infer<typeof markReturnedSchema>;

export const communicationBatchSchema = z.object({
  name: requiredTrimmed.pipe(z.string().max(200)),
  channel: z.enum(COMM_CHANNELS),
  templateId: uuid,
  audienceFilter: z.record(z.string(), z.unknown()),
});
export type CommunicationBatchInput = z.infer<typeof communicationBatchSchema>;
