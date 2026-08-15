import { Injectable, NotFoundException } from '@nestjs/common';
import type { EmploymentStatus, HiringStatus, Prisma } from '@jumpstart/database';
import type { EmployerInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface EmployerListFilters {
  hiringStatus?: HiringStatus;
  industry?: string;
  /** Chapter filter — matches the `chapterState` column, NOT the postal state. */
  chapterState?: string;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set([
  'name',
  'hiringStatus',
  'industry',
  'state',
  'chapterState',
  'city',
  'createdAt',
]);

/** Statuses meaning the participant actually reached hire (a placement, §6.9). */
const PLACED: ReadonlySet<EmploymentStatus> = new Set([
  'hired',
  'active',
  'terminated',
  'resigned',
  'completed',
]);

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EmployersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: EmployerListFilters) {
    const where: Prisma.EmployerWhereInput = {
      deletedAt: null,
      ...(filters.hiringStatus ? { hiringStatus: filters.hiringStatus } : {}),
      ...(filters.industry
        ? { industry: { contains: filters.industry, mode: 'insensitive' } }
        : {}),
      ...(filters.chapterState ? { chapterState: filters.chapterState } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { contactPerson: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.EmployerOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.employer.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { employments: { where: { deletedAt: null } } } } },
      }),
      this.prisma.employer.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const employer = await this.prisma.employer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!employer) throw new NotFoundException('Employer not found');
    // Chapter scoping (§7.2): same derivation as the list filter
    // (own chapterState — the postal `state` is just address data).
    assertChapterAccess(user.chapter, employer.chapterState);
    return employer;
  }

  /** Employer profile: participants employed + outcomes summary (§6.9). */
  async profile(id: string, user: AuthenticatedUser) {
    const employer = await this.get(id, user);

    // Names/titles/dates/statuses only — the §7.2 pay field class never
    // appears in this shape, so no permission-based stripping is needed here.
    const employments = await this.prisma.participantEmployment.findMany({
      where: { employerId: id, deletedAt: null },
      orderBy: { startDate: { sort: 'desc', nulls: 'last' } },
      select: {
        id: true,
        jobTitle: true,
        startDate: true,
        endDate: true,
        status: true,
        participantProfile: {
          select: {
            id: true,
            participantNumber: true,
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const now = Date.now();
    const placements = employments.filter((e) => PLACED.has(e.status));
    const retained90Days = placements.filter((e) => {
      if (!e.startDate) return false;
      const end = e.endDate?.getTime() ?? now;
      return end - e.startDate.getTime() >= 90 * DAY_MS;
    }).length;

    return {
      employer,
      employments,
      outcomes: {
        placements: placements.length,
        currentlyActive: employments.filter((e) => e.status === 'active').length,
        retained90Days,
      },
    };
  }

  async create(input: EmployerInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): the creator decides the chapter — scoped users
    // get theirs stamped, all-chapters users must pick one.
    const chapterState = resolveCreateChapter(user.chapter, input.chapterState);
    const employer = await this.prisma.employer.create({
      data: { ...input, chapterState, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'employer', employer.id, employer);
    return employer;
  }

  async update(id: string, input: Partial<EmployerInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    // ...and a scoped user cannot move the record to another chapter either.
    assertChapterAccess(user.chapter, input.chapterState ?? null);
    const updated = await this.prisma.employer.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'employer', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    await this.prisma.employer.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'employer', id, existing);
    return { ok: true };
  }
}
