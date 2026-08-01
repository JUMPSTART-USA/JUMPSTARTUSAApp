import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { InstitutionInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

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

  async get(id: string, user: AuthenticatedUser) {
    const institution = await this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
    });
    if (!institution) throw new NotFoundException('Institution not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own state).
    assertChapterAccess(user.chapter, institution.state);
    return institution;
  }

  /** Institution profile page: classes held, participants served, volunteers (§6.2). */
  async profile(id: string, user: AuthenticatedUser) {
    const institution = await this.get(id, user);

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

  async create(input: InstitutionInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): a scoped user cannot create for another chapter.
    assertChapterAccess(user.chapter, input.state);
    const institution = await this.prisma.institution.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'institution', institution.id, institution);
    return institution;
  }

  async update(id: string, input: Partial<InstitutionInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    // ...and a scoped user cannot move the record to another chapter either.
    assertChapterAccess(user.chapter, input.state);
    const updated = await this.prisma.institution.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'institution', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    await this.prisma.institution.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'institution', id, existing);
    return { ok: true };
  }
}
