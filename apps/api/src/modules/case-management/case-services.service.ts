import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { CaseServiceInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertParticipant } from './participant.util';

export interface CaseServiceListFilters {
  participantProfileId?: string;
  serviceType?: string;
  from?: Date;
  to?: Date;
}

const SORTABLE = new Set(['serviceDate', 'serviceType', 'providerName', 'createdAt']);

const SERVICE_INCLUDE = {
  participantProfile: {
    select: { person: { select: { firstName: true, lastName: true } } },
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

  async get(id: string) {
    const service = await this.prisma.caseService.findFirst({
      where: { id, deletedAt: null },
      include: SERVICE_INCLUDE,
    });
    if (!service) throw new NotFoundException('Case service not found');
    return service;
  }

  async create(input: CaseServiceInput, userId: string) {
    await assertParticipant(this.prisma, input.participantProfileId);
    const service = await this.prisma.caseService.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'case_service', service.id, service);
    return service;
  }

  async update(id: string, input: Partial<CaseServiceInput>, userId: string) {
    const existing = await this.prisma.caseService.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Case service not found');
    if (input.participantProfileId) await assertParticipant(this.prisma, input.participantProfileId);
    const updated = await this.prisma.caseService.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'case_service', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.prisma.caseService.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Case service not found');
    await this.prisma.caseService.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'case_service', id, existing);
    return { ok: true };
  }
}
