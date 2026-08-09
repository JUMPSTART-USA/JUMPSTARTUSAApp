import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { CaseServiceInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { assertParticipant } from './participant.util';
import { DEFAULT_SERVICE_TYPES } from '@jumpstart/shared';

export interface CaseServiceListFilters {
  participantProfileId?: string;
  serviceType?: string;
  from?: Date;
  to?: Date;
  state?: string;
}

const SORTABLE = new Set(['serviceDate', 'serviceType', 'providerName', 'createdAt']);

const SERVICE_INCLUDE = {
  participantProfile: {
    select: { chapterState: true, person: { select: { firstName: true, lastName: true } } },
  },
} as const;

@Injectable()
export class CaseServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: CaseServiceListFilters) {
    const where: Prisma.CaseServiceWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      // Chapter scoping (§7.2): derived through the participant profile.
      ...(filters.state ? { participantProfile: { chapterState: filters.state } } : {}),
      ...(filters.serviceType
        ? { serviceType: { contains: filters.serviceType, mode: 'insensitive' } }
        : {}),
      ...(filters.from || filters.to
        ? {
            serviceDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { serviceType: { contains: query.search, mode: 'insensitive' } },
              { providerName: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.CaseServiceOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { serviceDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.caseService.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: SERVICE_INCLUDE,
      }),
      this.prisma.caseService.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const service = await this.prisma.caseService.findFirst({
      where: { id, deletedAt: null },
      include: SERVICE_INCLUDE,
    });
    if (!service) throw new NotFoundException('Case service not found');
    // Chapter scoping (§7.2): same derivation as the list filter (participant).
    assertChapterAccess(user.chapter, service.participantProfile.chapterState);
    return service;
  }

  async create(input: CaseServiceInput, user: AuthenticatedUser) {
    const userId = user.id;
    await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    const service = await this.prisma.caseService.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'case_service', service.id, service);
    return service;
  }

  async update(id: string, input: Partial<CaseServiceInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.getForModify(id, user);
    if (input.participantProfileId) {
      await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    }
    const updated = await this.prisma.caseService.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'case_service', id, existing, updated);
    return updated;
  }

  /** Fetch-for-mutation with the chapter guard (§7.2) applied once. */
  private async getForModify(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.caseService.findFirst({
      where: { id, deletedAt: null },
      include: { participantProfile: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Case service not found');
    assertChapterAccess(user.chapter, existing.participantProfile.chapterState);
    const { participantProfile: _participantProfile, ...serviceOnly } = existing;
    return serviceOnly;
  }

  /** Admin-overridable service menu (`services.types` app setting). */
  async serviceTypes(): Promise<{ types: string[] }> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'services.types' } });
    const value = row?.value;
    if (Array.isArray(value) && value.every((v) => typeof v === 'string') && value.length > 0) {
      return { types: value };
    }
    return { types: [...DEFAULT_SERVICE_TYPES] };
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.getForModify(id, user);
    await this.prisma.caseService.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'case_service', id, existing);
    return { ok: true };
  }
}
