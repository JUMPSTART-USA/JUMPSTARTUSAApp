import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import {
  ALUMNI_STATUSES,
  CHAPTER_STATES,
  VOLUNTEER_STATUSES,
  type ChapterState,
  type CommunicationBatchInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { renderMergeFields } from './merge-fields.util';
import { ProviderService, type ProviderSendResult } from './provider.service';
import { channelConsentWhere, suppressionReason } from './suppression.util';

// The shared batch schema keeps audienceFilter as an open record (the SPA
// builds it incrementally); the server validates the supported Phase-1 keys
// strictly so typos fail loudly instead of matching everyone.
const audienceFilterSchema = z
  .object({
    alumniStatus: z.enum(ALUMNI_STATUSES).optional(),
    volunteerStatus: z.enum(VOLUNTEER_STATUSES).optional(),
    // The audience "state" IS the batch's chapter (§7.2) — optional at the
    // pipe; create() stamps a scoped creator's chapter and requires a pick
    // from all-chapters users.
    state: z.enum(CHAPTER_STATES).optional(),
  })
  .strict();

export interface BatchListFilters {
  state?: string;
}

const BATCH_SORTABLE = new Set(['name', 'channel', 'status', 'createdAt', 'sentAt']);

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly provider: ProviderService,
  ) {}

  /**
   * §6.12 batch send: resolve the audience, enforce suppression in the query
   * (doNotContact ALWAYS excluded, channel consent per person), create the
   * batch + one queued communication per person. Rows stay queued until staff
   * dispatch them: POST /batches/:id/dispatch for email/SMS, or the letter
   * PDF generator (GET /batches/:id/letters.pdf) for letter batches.
   */
  async create(input: CommunicationBatchInput, user: AuthenticatedUser) {
    const parsed = audienceFilterSchema.safeParse(input.audienceFilter);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Unsupported audience filter',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const filter = parsed.data;

    // Chapter scoping (§7.2): the audience "state" IS the batch's chapter —
    // a scoped creator's own chapter, or the explicit pick from an
    // all-chapters creator — forced back into the stored filter so an
    // audience can never span chapters.
    const batchState = resolveCreateChapter(user.chapter, filter.state) as ChapterState;
    filter.state = batchState;

    const template = await this.prisma.communicationTemplate.findFirst({
      where: { id: input.templateId, active: true },
    });
    if (!template) throw new BadRequestException('Template not found or inactive');
    if (template.channel !== input.channel) {
      throw new BadRequestException('Template channel does not match the batch channel');
    }

    // A person's chapter binds through their profile chapterState (person.state
    // is a mailing address): a status filter carries the chapter directly;
    // with no status filter, any profile in the batch chapter qualifies.
    const demographic: Prisma.PersonWhereInput = {
      deletedAt: null,
      ...(filter.alumniStatus
        ? {
            participantProfile: {
              deletedAt: null,
              alumniStatus: filter.alumniStatus,
              chapterState: batchState,
            },
          }
        : {}),
      ...(filter.volunteerStatus
        ? {
            volunteerProfile: {
              deletedAt: null,
              status: filter.volunteerStatus,
              chapterState: batchState,
            },
          }
        : {}),
      ...(!filter.alumniStatus && !filter.volunteerStatus
        ? {
            OR: [
              { participantProfile: { deletedAt: null, chapterState: batchState } },
              { volunteerProfile: { deletedAt: null, chapterState: batchState } },
            ],
          }
        : {}),
    };

    const [matched, recipients] = await this.prisma.$transaction([
      this.prisma.person.count({ where: demographic }),
      this.prisma.person.findMany({
        where: { AND: [demographic, channelConsentWhere(input.channel)] },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          participantProfile: {
            select: {
              participantNumber: true,
              assignedCaseManager: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communicationBatch.create({
        data: {
          name: input.name,
          channel: input.channel,
          audienceFilter: filter as Prisma.InputJsonValue,
          chapterState: batchState,
          status: 'queued',
          createdById: user.id,
          updatedById: user.id,
        },
      });
      if (recipients.length > 0) {
        // Merge fields render per person NOW so each Communication row is the
        // literal content that will leave the building.
        await tx.communication.createMany({
          data: recipients.map((person) => {
            const cm = person.participantProfile?.assignedCaseManager;
            const src = {
              firstName: person.firstName,
              lastName: person.lastName,
              preferredName: person.preferredName,
              participantNumber: person.participantProfile?.participantNumber ?? null,
              caseManager: cm ? `${cm.firstName} ${cm.lastName}` : null,
            };
            return {
              personId: person.id,
              chapterState: batchState,
              channel: input.channel,
              templateId: template.id,
              batchId: created.id,
              subject: template.subject ? renderMergeFields(template.subject, src) : null,
              body: renderMergeFields(template.body, src),
              status: 'queued' as const,
              sentById: user.id,
            };
          }),
        });
      }
      return created;
    });

    await this.audit.log({
      userId: user.id,
      action: 'create',
      entityType: 'communication_batch',
      entityId: batch.id,
      newValues: batch,
      metadata: {
        matched,
        queued: recipients.length,
        suppressed: matched - recipients.length,
      },
    });

    return {
      batch,
      counts: { matched, queued: recipients.length, suppressed: matched - recipients.length },
    };
  }

  /**
   * Dispatch (§6.12): push the batch's queued rows through the real providers.
   * Email/SMS only — letter batches go through the letter PDF generator
   * (GET /batches/:id/letters.pdf) and are rejected here. Suppression is
   * RE-CHECKED per person at send time: consent may have changed since the
   * batch was built, and the audience query is not a permission to send
   * forever. Failures (provider unconfigured, Graph/Twilio errors, late
   * suppression) mark the row failed with a human-readable statusDetail;
   * already-failed rows are not retried (only queued rows are processed).
   */
  async dispatch(id: string, user: AuthenticatedUser) {
    const batch = await this.prisma.communicationBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('Batch not found');
    // Chapter scoping (§7.2): a scoped user cannot dispatch another chapter's batch.
    assertChapterAccess(user.chapter, batch.chapterState);
    if (batch.channel === 'letter') {
      throw new BadRequestException(
        'Letter batches are not dispatched electronically — download letters.pdf instead',
      );
    }

    const queued = await this.prisma.communication.findMany({
      where: { batchId: id, status: 'queued' },
      include: { person: true },
      orderBy: { createdAt: 'asc' },
    });

    let sent = 0;
    let failed = 0;
    for (const comm of queued) {
      const blocked = suppressionReason(comm.person, comm.channel);
      const result: ProviderSendResult = blocked
        ? { sent: false, detail: `Suppressed at dispatch: ${blocked}` }
        : comm.channel === 'email'
          ? await this.provider.sendEmail(comm.person.primaryEmail!, comm.subject ?? '', comm.body)
          : await this.provider.sendSms(comm.person.primaryPhone!, comm.body);

      await this.prisma.communication.update({
        where: { id: comm.id },
        data: result.sent
          ? { status: 'sent', sentAt: new Date(), statusDetail: result.detail ?? null }
          : { status: 'failed', statusDetail: result.detail ?? 'Send failed' },
      });
      if (result.sent) sent += 1;
      else failed += 1;
    }

    // The batch status has to reflect what actually happened. It was previously
    // set to 'sent' unconditionally, so a year-end appeal where every single
    // message failed still read "Sent" — a development director could report a
    // successful send to the board on the strength of that badge.
    const status = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partially_sent';

    const updated = await this.prisma.communicationBatch.update({
      where: { id },
      data: { status, sentAt: batch.sentAt ?? new Date(), updatedById: user.id },
    });

    await this.audit.log({
      userId: user.id,
      action: 'update',
      entityType: 'communication_batch',
      entityId: id,
      metadata: { dispatched: queued.length, sent, failed },
    });

    return { batch: updated, counts: { processed: queued.length, sent, failed } };
  }

  async list(query: ListQuery, filters: BatchListFilters) {
    const where: Prisma.CommunicationBatchWhereInput = {
      ...(filters.state ? { chapterState: filters.state } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const orderBy: Prisma.CommunicationBatchOrderByWithRelationInput =
      query.sortBy && BATCH_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.communicationBatch.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { communications: true } } },
      }),
      this.prisma.communicationBatch.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const batch = await this.prisma.communicationBatch.findUnique({
      where: { id },
      include: { _count: { select: { communications: true } } },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    // Chapter scoping (§7.2): batch id probes cannot cross chapters.
    assertChapterAccess(user.chapter, batch.chapterState);

    const statusCounts = await this.prisma.communication.groupBy({
      by: ['status'],
      where: { batchId: id },
      _count: { _all: true },
    });
    return {
      ...batch,
      statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])),
    };
  }
}
