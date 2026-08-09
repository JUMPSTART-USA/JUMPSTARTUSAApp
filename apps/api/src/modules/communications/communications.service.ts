import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CommStatus, Prisma } from '@jumpstart/database';
import {
  communicationTemplateSchema,
  type CommChannel,
  type CommunicationTemplateInput,
  type ListQuery,
  type SendCommunicationInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { renderMergeFields } from './merge-fields.util';
import { ProviderService } from './provider.service';
import { suppressionReason } from './suppression.util';

export interface TemplateListFilters {
  channel?: CommChannel;
  active?: boolean;
}

export interface CommunicationListFilters {
  personId?: string;
  channel?: CommChannel;
  status?: CommStatus;
  batchId?: string;
  state?: string;
}

// Whitelists of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const TEMPLATE_SORTABLE = new Set(['name', 'channel', 'active', 'createdAt']);
const COMMUNICATION_SORTABLE = new Set(['createdAt', 'sentAt', 'status', 'channel']);

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly provider: ProviderService,
  ) {}

  // ── Templates CRUD ─────────────────────────────────────────────────────────

  async listTemplates(query: ListQuery, filters: TemplateListFilters) {
    const where: Prisma.CommunicationTemplateWhereInput = {
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const orderBy: Prisma.CommunicationTemplateOrderByWithRelationInput =
      query.sortBy && TEMPLATE_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.communicationTemplate.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.communicationTemplate.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getTemplate(id: string) {
    const template = await this.prisma.communicationTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async createTemplate(input: CommunicationTemplateInput, userId: string) {
    const template = await this.prisma.communicationTemplate.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'communication_template', template.id, template);
    return template;
  }

  async updateTemplate(id: string, input: Partial<CommunicationTemplateInput>, userId: string) {
    const existing = await this.getTemplate(id);
    // PATCH bypasses the schema's cross-field superRefine (email subject, SMS
    // length) — re-run it against the merged row so partial edits can't break
    // the invariants.
    const merged = communicationTemplateSchema.safeParse({
      name: input.name ?? existing.name,
      channel: input.channel ?? existing.channel,
      subject: input.subject ?? existing.subject ?? undefined,
      body: input.body ?? existing.body,
      active: input.active ?? existing.active,
    });
    if (!merged.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: merged.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const updated = await this.prisma.communicationTemplate.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'communication_template', id, existing, updated);
    return updated;
  }

  /**
   * Templates have no deletedAt: sent communications keep their FK forever,
   * so "delete" deactivates the template instead of removing history.
   */
  async removeTemplate(id: string, userId: string) {
    const existing = await this.getTemplate(id);
    await this.prisma.communicationTemplate.update({
      where: { id },
      data: { active: false, updatedById: userId },
    });
    await this.audit.logDelete(userId, 'communication_template', id, existing);
    return { ok: true };
  }

  // ── One-off send (§6.12) ───────────────────────────────────────────────────

  async send(input: SendCommunicationInput, user: AuthenticatedUser) {
    const person = await this.prisma.person.findFirst({
      where: { id: input.personId, deletedAt: null },
      include: {
        participantProfile: {
          select: {
            chapterState: true,
            participantNumber: true,
            assignedCaseManager: { select: { firstName: true, lastName: true } },
          },
        },
        volunteerProfile: { select: { chapterState: true } },
        donors: { where: { deletedAt: null }, select: { chapterState: true } },
      },
    });
    if (!person) throw new NotFoundException('Person not found');

    // Chapter scoping (§7.2): the recipient's chapters come from EVERY chapter
    // association — participant, volunteer, AND donor. person.state is a
    // mailing address and is deliberately NOT a chapter source (rule 2).
    const recipientChapters = [
      person.participantProfile?.chapterState,
      person.volunteerProfile?.chapterState,
      ...person.donors.map((d) => d.chapterState),
    ].filter((c): c is string => !!c);

    // A scoped user may only message someone reachable in their own chapter (or
    // a person with no chapter association yet). Belonging to other chapters
    // only → 403, same contract as assertChapterAccess.
    if (user.chapter && recipientChapters.length && !recipientChapters.includes(user.chapter)) {
      throw new ForbiddenException('Record belongs to another chapter');
    }

    // Stamp: scoped sender → their chapter; all-chapters sender → the
    // recipient's single chapter when unambiguous, else an explicit pick.
    const distinctChapters = [...new Set(recipientChapters)];
    const chapterState =
      user.chapter ??
      (distinctChapters.length === 1 ? distinctChapters[0] : undefined) ??
      input.chapterState ??
      null;
    if (!chapterState) throw new BadRequestException('Select a chapter');

    const blocked = suppressionReason(person, input.channel);
    if (blocked) throw new BadRequestException(blocked);

    let template = null;
    if (input.templateId) {
      template = await this.prisma.communicationTemplate.findFirst({
        where: { id: input.templateId, active: true },
      });
      if (!template) throw new BadRequestException('Template not found or inactive');
      if (template.channel !== input.channel) {
        throw new BadRequestException('Template channel does not match the requested channel');
      }
    }

    const cm = person.participantProfile?.assignedCaseManager;
    const src = {
      firstName: person.firstName,
      lastName: person.lastName,
      preferredName: person.preferredName,
      participantNumber: person.participantProfile?.participantNumber ?? null,
      caseManager: cm ? `${cm.firstName} ${cm.lastName}` : null,
    };
    // Ad-hoc body overrides the template body when both are given.
    const bodySource = input.body ?? template?.body;
    if (!bodySource) throw new BadRequestException('Choose a template or write a message');
    const body = renderMergeFields(bodySource, src);
    const subjectSource = input.subject ?? template?.subject ?? null;
    const subject = subjectSource ? renderMergeFields(subjectSource, src) : null;
    if (input.channel === 'email' && !subject) {
      throw new BadRequestException('Email needs a subject line');
    }

    // Bounced ≠ opted out (§6.12): an explicit one-off proceeds with a warning.
    const warning =
      input.channel === 'email' && person.emailBouncedAt
        ? `This address bounced on ${person.emailBouncedAt.toISOString().slice(0, 10)} — delivery may fail`
        : null;

    let communication = await this.prisma.communication.create({
      data: {
        personId: person.id,
        chapterState,
        channel: input.channel,
        templateId: template?.id ?? null,
        subject,
        body,
        status: 'queued',
        statusDetail: warning,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        sentById: user.id,
      },
    });

    // 'letter' stays queued — GET /communications/:id/letter.pdf renders it
    // (and marks it sent). Email/SMS dispatch immediately through the real
    // providers; failures are recorded, not hidden.
    if (input.channel === 'email' || input.channel === 'sms') {
      const result =
        input.channel === 'email'
          ? await this.provider.sendEmail(person.primaryEmail!, subject!, body)
          : await this.provider.sendSms(person.primaryPhone!, body);
      communication = await this.prisma.communication.update({
        where: { id: communication.id },
        data: result.sent
          ? {
              status: 'sent',
              sentAt: new Date(),
              statusDetail: [warning, result.detail].filter(Boolean).join('; ') || null,
            }
          : {
              status: 'failed',
              statusDetail:
                [warning, result.detail ?? 'Send failed'].filter(Boolean).join('; ') || null,
            },
      });
    }

    await this.audit.logCreate(user.id, 'communication', communication.id, communication);
    return warning ? { ...communication, warning } : communication;
  }

  // ── History (person timeline feed) ─────────────────────────────────────────

  async list(query: ListQuery, filters: CommunicationListFilters) {
    const where: Prisma.CommunicationWhereInput = {
      ...(filters.personId ? { personId: filters.personId } : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.batchId ? { batchId: filters.batchId } : {}),
      ...(filters.state ? { chapterState: filters.state } : {}),
      ...(query.search
        ? {
            OR: [
              { subject: { contains: query.search, mode: 'insensitive' } },
              { body: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.CommunicationOrderByWithRelationInput =
      query.sortBy && COMMUNICATION_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' }; // timeline: newest first

    const [items, total] = await this.prisma.$transaction([
      this.prisma.communication.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          template: { select: { id: true, name: true } },
          batch: { select: { id: true, name: true } },
          person: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
        },
      }),
      this.prisma.communication.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
