import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { InstitutionInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface InstitutionListFilters {
  state?: string;
  active?: boolean;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'state', 'city', 'institutionType', 'createdAt']);

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: InstitutionListFilters) {
    const where: Prisma.InstitutionWhereInput = {
      deletedAt: null,
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
              { chaplainName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.InstitutionOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.institution.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { insideClasses: { where: { deletedAt: null } } } } },
      }),
      this.prisma.institution.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const institution = await this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
    });
    if (!institution) throw new NotFoundException('Institution not found');
    return institution;
  }

  /** Institution profile page: classes held, participants served, volunteers (§6.2). */
  async profile(id: string) {
    const institution = await this.get(id);

    const [classes, participantsServed, volunteerAssignments] = await this.prisma.$transaction([
      this.prisma.insideClass.findMany({
        where: { institutionId: id, deletedAt: null },
        orderBy: { startDate: 'desc' },
        include: { _count: { select: { enrollments: { where: { deletedAt: null } } } } },
      }),
      this.prisma.insideClassEnrollment.findMany({
        where: { insideClass: { institutionId: id }, deletedAt: null },
        distinct: ['participantProfileId'],
        select: { participantProfileId: true },
      }),
      this.prisma.volunteerAssignment.findMany({
        where: { institutionId: id, deletedAt: null },
        include: {
          volunteerProfile: {
            include: { person: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { startDate: 'desc' },
      }),
    ]);

    return {
      institution,
      classes,
      participantsServedCount: participantsServed.length,
      volunteerAssignments,
    };
  }

  async create(input: InstitutionInput, userId: string) {
    const institution = await this.prisma.institution.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'institution', institution.id, institution);
    return institution;
  }

  async update(id: string, input: Partial<InstitutionInput>, userId: string) {
    const existing = await this.get(id);
    const updated = await this.prisma.institution.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'institution', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.get(id);
    await this.prisma.institution.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'institution', id, existing);
    return { ok: true };
  }
}
