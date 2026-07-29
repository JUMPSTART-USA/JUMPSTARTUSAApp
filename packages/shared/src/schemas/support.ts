import { z } from 'zod';
import { requiredTrimmed } from './common';

// ── Support tickets (§6.15) ─────────────────────────────────────────────────
// Every signed-in user may file tickets and read their own; administrators
// see and answer all of them.

export const TICKET_CATEGORIES = ['bug', 'feature', 'question', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: 'Bug report',
  feature: 'Feature suggestion',
  question: 'Question',
  other: 'Other',
};

export const supportTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  subject: requiredTrimmed.pipe(z.string().max(200)),
  body: requiredTrimmed.pipe(z.string().max(10_000)),
});
export type SupportTicketInput = z.infer<typeof supportTicketSchema>;

export const supportMessageSchema = z.object({
  body: requiredTrimmed.pipe(z.string().max(10_000)),
});
export type SupportMessageInput = z.infer<typeof supportMessageSchema>;

export const supportStatusSchema = z.object({ status: z.enum(TICKET_STATUSES) });
export type SupportStatusInput = z.infer<typeof supportStatusSchema>;
