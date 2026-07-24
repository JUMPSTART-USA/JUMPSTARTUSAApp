import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import {
  ALUMNI_STATUSES,
  US_STATES,
  VOLUNTEER_STATUSES,
  type CommunicationBatchInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { renderMergeFields } from './merge-fields.util';
import { channelConsentWhere } from './suppression.util';

// The shared batch schema keeps audienceFilter as an open record (the SPA
// builds it incrementally); the server validates the supported Phase-1 keys
// strictly so typos fail loudly instead of matching everyone.
const audienceFilterSchema = z
  .object({
    alumniStatus: z.enum(ALUMNI_STATUSES).optional(),
    volunteerStatus: z.enum(VOLUNTEER_STATUSES).optional(),
    state: z.enum(US_STATES).optional(),
  })
  .strict();

const BATCH_SORTABLE = new Set(['name', 'channel', 'status', 'createdAt', 'sentAt']);

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * §6.12 batch send: resolve the audience, enforce suppression in the query
   * (doNotContact ALWAYS excluded, channel consent per person), create the
   * batch + one queued communication per person. Actual dispatch (email/SMS
   * workers, the letter PDF generator) is Phase-2 wiring — rows stay queued.
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

    const template = await this.prisma.communicationTemplate.findFirst({
      where: { id: input.templateId, active: true },
    });
    if (!template) throw new BadRequestException('Template not found or inactive');
    if (template.channel !== input.channel) {
      throw new BadRequestException('Template channel does not match the batch channel');
    }

    const demographic: Prisma.PersonWhereInput = {
      deletedAt: null,
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.alumniStatus
        ? { participantProfile: { deletedAt: null, alumniStatus: filter.alumniStatus } }
        : {}),
      ...(filter.volunteerStatus
        ? { volunteerProfile: { deletedAt: null, status: filter.volunteerStatus } }
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
          participantProfile: { select: { participantNumber: true } },
        },
      }),
    ]);

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communicationBatch.create({
        data: {
          name: input.name,
          channel: input.channel,
          audienceFilter: filter as Prisma.InputJsonValue,
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
            const src = {
              firstName: person.firstName,
              lastName: person.lastName,
              preferredName: person.preferredName,
              participantNumber: person.participantProfile?.participantNumber ?? null,
            };
            return {
              personId: person.id,
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

  async list(query: ListQuery) {
    const where: Prisma.CommunicationBatchWhereInput = query.search
      ? { name: { contains: query.search, mode: 'insensitive' } }
      : {};

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

  async get(id: string) {
    const batch = await this.prisma.communicationBatch.findUnique({
      where: { id },
      include: { _count: { select: { communications: true } } },
    });
    if (!batch) throw new NotFoundException('Batch not found');

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
