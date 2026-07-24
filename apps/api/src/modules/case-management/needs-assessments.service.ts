import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ListQuery, NeedsAssessmentInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertParticipant } from './participant.util';

export interface NeedsAssessmentListFilters {
  participantProfileId?: string;
  from?: Date;
  to?: Date;
}

const SORTABLE = new Set(['administeredAt', 'instrumentName', 'createdAt']);

const ASSESSMENT_INCLUDE = {
  participantProfile: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} as const;

@Injectable()
export class NeedsAssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: NeedsAssessmentListFilters) {
    const where: Prisma.NeedsAssessmentWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.from || filters.to
        ? {
            administeredAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? { instrumentName: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const orderBy: Prisma.NeedsAssessmentOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { administeredAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.needsAssessment.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: ASSESSMENT_INCLUDE,
      }),
      this.prisma.needsAssessment.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const assessment = await this.prisma.needsAssessment.findFirst({
      where: { id, deletedAt: null },
      include: ASSESSMENT_INCLUDE,
    });
    if (!assessment) throw new NotFoundException('Needs assessment not found');
    return assessment;
  }

  async create(input: NeedsAssessmentInput, userId: string) {
    await assertParticipant(this.prisma, input.participantProfileId);
    const assessment = await this.prisma.needsAssessment.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'needs_assessment', assessment.id, assessment);
    return assessment;
  }

  async update(id: string, input: Partial<NeedsAssessmentInput>, userId: string) {
    const existing = await this.prisma.needsAssessment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Needs assessment not found');
    if (input.participantProfileId) await assertParticipant(this.prisma, input.participantProfileId);
    const updated = await this.prisma.needsAssessment.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'needs_assessment', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.prisma.needsAssessment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Needs assessment not found');
    await this.prisma.needsAssessment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'needs_assessment', id, existing);
    return { ok: true };
  }
}
