import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { AlumniEngagementInput, EngagementType, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface AlumniEngagementListFilters {
  participantProfileId?: string;
  engagementType?: EngagementType;
  from?: Date;
  to?: Date;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['engagementDate', 'engagementType', 'createdAt']);

const PARTICIPANT_SUMMARY = {
  select: {
    id: true,
    participantNumber: true,
    person: { select: { firstName: true, lastName: true } },
  },
} as const;

@Injectable()
export class AlumniEngagementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: AlumniEngagementListFilters) {
    const where: Prisma.AlumniEngagementWhereInput = {
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.engagementType ? { engagementType: filters.engagementType } : {}),
      ...(filters.from || filters.to
        ? {
            engagementDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { notes: { contains: query.search, mode: 'insensitive' } },
              {
                participantProfile: {
                  person: {
                    OR: [
                      { firstName: { contains: query.search, mode: 'insensitive' } },
                      { lastName: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.AlumniEngagementOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { engagementDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.alumniEngagement.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { participantProfile: PARTICIPANT_SUMMARY },
      }),
      this.prisma.alumniEngagement.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const engagement = await this.prisma.alumniEngagement.findUnique({
      where: { id },
      include: { participantProfile: PARTICIPANT_SUMMARY },
    });
    if (!engagement) throw new NotFoundException('Alumni engagement not found');
    return engagement;
  }

  async create(input: AlumniEngagementInput, userId: string) {
    const participant = await this.prisma.participantProfile.findFirst({
      where: { id: input.participantProfileId, deletedAt: null },
    });
    if (!participant) throw new BadRequestException('Participant not found');

    const engagement = await this.prisma.alumniEngagement.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'alumni_engagement', engagement.id, engagement);
    return engagement;
  }

  async update(
    id: string,
    input: Partial<Omit<AlumniEngagementInput, 'participantProfileId'>>,
    userId: string,
  ) {
    const existing = await this.get(id);
    const updated = await this.prisma.alumniEngagement.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'alumni_engagement', id, existing, updated);
    return updated;
  }

  // No deletedAt on this model: a mislogged engagement is removed outright;
  // the audit row preserves what was deleted.
  async remove(id: string, userId: string) {
    const existing = await this.get(id);
    await this.prisma.alumniEngagement.delete({ where: { id } });
    await this.audit.logDelete(userId, 'alumni_engagement', id, existing);
    return { ok: true };
  }
}
