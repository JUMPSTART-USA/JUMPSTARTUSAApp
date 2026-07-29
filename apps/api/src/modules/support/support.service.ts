import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  SupportMessageInput,
  SupportTicketInput,
  TicketStatus,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';

const AUTHOR_SELECT = { select: { id: true, firstName: true, lastName: true } } as const;

/** Administrators (the admin role) work the queue; everyone files tickets. */
export function isAdmin(user: AuthenticatedUser): boolean {
  return user.roles.includes('admin');
}

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async create(input: SupportTicketInput, user: AuthenticatedUser) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        category: input.category,
        subject: input.subject,
        createdById: user.id,
        messages: { create: { authorId: user.id, body: input.body } },
      },
      include: { messages: { include: { author: AUTHOR_SELECT } } },
    });
    await this.audit.logCreate(user.id, 'support_ticket', ticket.id, {
      number: ticket.number,
      category: ticket.category,
      subject: ticket.subject,
    });
    return ticket;
  }

  /** The caller's own tickets, newest activity first. */
  listMine(user: AuthenticatedUser) {
    return this.prisma.supportTicket.findMany({
      where: { createdById: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
  }

  /** Admin queue — every ticket, optionally filtered by status. */
  listAll(user: AuthenticatedUser, status?: string) {
    this.assertAdmin(user);
    return this.prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: AUTHOR_SELECT,
        _count: { select: { messages: true } },
      },
    });
  }

  /** Ticket + full correspondence — owner or administrator only. */
  async detail(id: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        createdBy: AUTHOR_SELECT,
        messages: { orderBy: { createdAt: 'asc' }, include: { author: AUTHOR_SELECT } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.createdById !== user.id && !isAdmin(user)) {
      // Same shape as a missing ticket — do not confirm existence to others.
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  /** Reply on the thread — owner or administrator. */
  async addMessage(id: string, input: SupportMessageInput, user: AuthenticatedUser) {
    const ticket = await this.detail(id, user);
    const message = await this.prisma.supportMessage.create({
      data: { ticketId: ticket.id, authorId: user.id, body: input.body },
      include: { author: AUTHOR_SELECT },
    });
    // Bump the thread so queues sort by latest activity.
    await this.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date() },
    });
    // An admin answer notifies the submitter by email (when mail is set up).
    if (isAdmin(user) && ticket.createdById !== user.id) {
      const owner = await this.prisma.user.findUnique({ where: { id: ticket.createdById } });
      if (owner) {
        await this.mail.send(
          owner.email,
          `Support ticket #${ticket.number}: ${ticket.subject}`,
          `<p>Hi ${escapeHtml(owner.firstName)},</p>
           <p>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)} replied to your support ticket
           <strong>#${ticket.number} — ${escapeHtml(ticket.subject)}</strong>:</p>
           <blockquote>${escapeHtml(input.body).replace(/\n/g, '<br/>')}</blockquote>
           <p>View the full thread on the Support page of the Operations Platform.</p>`,
        );
      }
    }
    return message;
  }

  /** Status changes are the administrators' call. */
  async setStatus(id: string, status: TicketStatus, user: AuthenticatedUser) {
    this.assertAdmin(user);
    const existing = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ticket not found');
    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: { status },
    });
    await this.audit.logUpdate(user.id, 'support_ticket', id, { status: existing.status }, { status });
    return ticket;
  }

  private assertAdmin(user: AuthenticatedUser) {
    if (!isAdmin(user)) {
      throw new ForbiddenException('Administrators only');
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
