import type { TicketCategory, TicketStatus } from '@jumpstart/shared';

export interface TicketAuthor {
  id: string;
  firstName: string;
  lastName: string;
}

export interface SupportTicketRow {
  id: string;
  number: number;
  category: TicketCategory;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: TicketAuthor;
  _count?: { messages: number };
}

export interface SupportMessageRow {
  id: string;
  body: string;
  createdAt: string;
  author: TicketAuthor;
}

export interface SupportTicketDetail extends SupportTicketRow {
  createdBy: TicketAuthor;
  messages: SupportMessageRow[];
}
