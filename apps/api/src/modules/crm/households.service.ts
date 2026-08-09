import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { HouseholdInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { roundMoney } from './giving.util';

export interface HouseholdMemberInput {
  donorId: string;
  isHeadOfHousehold?: boolean;
}

export interface HouseholdListFilters {
  /** Chapter filter — the controller forces `user.chapter ?? requested`. */
  state?: string;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'chapterState', 'createdAt']);

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: HouseholdListFilters) {
    const where: Prisma.HouseholdWhereInput = {
      deletedAt: null,
      // Chapter scoping (§7.2): own chapterState column.
      ...(filters.state ? { chapterState: filters.state } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { envelopeName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.HouseholdOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [households, total] = await this.prisma.$transaction([
      this.prisma.household.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.household.count({ where }),
    ]);

    // Household giving = the members' combined hard-credit lifetime giving.
    const members = households.length
      ? await this.prisma.donor.findMany({
          where: { householdId: { in: households.map((h) => h.id) }, deletedAt: null },
          select: { id: true, householdId: true },
        })
      : [];
    const giving = members.length
      ? await this.prisma.donation.groupBy({
          by: ['donorId'],
          where: { donorId: { in: members.map((m) => m.id) }, deletedAt: null },
          _sum: { amount: true },
        })
      : [];
    const givingByDonor = new Map(giving.map((g) => [g.donorId, Number(g._sum.amount ?? 0)]));

    const memberCount = new Map<string, number>();
    const householdGiving = new Map<string, number>();
    for (const m of members) {
      if (!m.householdId) continue;
      memberCount.set(m.householdId, (memberCount.get(m.householdId) ?? 0) + 1);
      householdGiving.set(
        m.householdId,
        (householdGiving.get(m.householdId) ?? 0) + (givingByDonor.get(m.id) ?? 0),
      );
    }

    const items = households.map((household) => ({
      ...household,
      memberCount: memberCount.get(household.id) ?? 0,
      householdGiving: roundMoney(householdGiving.get(household.id) ?? 0),
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const household = await this.prisma.household.findFirst({ where: { id, deletedAt: null } });
    if (!household) throw new NotFoundException('Household not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(user.chapter, household.chapterState);
    return household;
  }

  /** Household detail: members with per-member lifetime giving + totals. */
  async detail(id: string, user: AuthenticatedUser) {
    const household = await this.get(id, user);

    const members = await this.prisma.donor.findMany({
      // A household never spans chapters (addMember enforces it); pinning the
      // query to the household's chapter also closes any donor-chapter drift
      // so detail can never surface a foreign-chapter member (§7.2).
      where: { householdId: id, deletedAt: null, chapterState: household.chapterState },
      orderBy: [{ isHeadOfHousehold: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        donorType: true,
        email: true,
        status: true,
        isHeadOfHousehold: true,
      },
    });

    const stats = members.length
      ? await this.prisma.donation.groupBy({
          by: ['donorId'],
          where: { donorId: { in: members.map((m) => m.id) }, deletedAt: null },
          _sum: { amount: true },
          _count: { _all: true },
          _max: { donationDate: true },
        })
      : [];
    const byDonor = new Map(stats.map((s) => [s.donorId, s]));

    const withGiving = members.map((m) => ({
      ...m,
      lifetimeGiving: Number(byDonor.get(m.id)?._sum.amount ?? 0),
      giftCount: byDonor.get(m.id)?._count._all ?? 0,
      lastGiftDate: byDonor.get(m.id)?._max.donationDate ?? null,
    }));

    const lastGiftDates = withGiving
      .map((m) => m.lastGiftDate)
      .filter((d): d is Date => d !== null);

    return {
      household,
      members: withGiving,
      totals: {
        memberCount: members.length,
        lifetimeGiving: roundMoney(withGiving.reduce((sum, m) => sum + m.lifetimeGiving, 0)),
        giftCount: withGiving.reduce((sum, m) => sum + m.giftCount, 0),
        lastGiftDate: lastGiftDates.length
          ? new Date(Math.max(...lastGiftDates.map((d) => d.getTime())))
          : null,
      },
    };
  }

  async create(input: HouseholdInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): scoped creators are stamped, all-chapters
    // creators must pick the chapter explicitly.
    const chapterState = resolveCreateChapter(user.chapter, input.chapterState);
    const household = await this.prisma.household.create({
      data: { ...input, chapterState, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'household', household.id, household);
    return household;
  }

  async update(id: string, input: Partial<HouseholdInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // 404 + chapter check
    // ...and a scoped user cannot move the household to another chapter either.
    assertChapterAccess(user.chapter, input.chapterState);
    const updated = await this.prisma.household.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'household', id, existing, updated);
    return updated;
  }

  /** Soft delete — members are released, their donor records untouched otherwise. */
  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // 404 + chapter check
    // Snapshot the membership first so each released donor gets its own audit row.
    const members = await this.prisma.donor.findMany({
      where: { householdId: id },
      select: { id: true, householdId: true, isHeadOfHousehold: true },
    });
    await this.prisma.donor.updateMany({
      where: { householdId: id },
      data: { householdId: null, isHeadOfHousehold: false, updatedById: userId },
    });
    for (const member of members) {
      await this.audit.logUpdate(
        userId,
        'donor',
        member.id,
        { householdId: member.householdId, isHeadOfHousehold: member.isHeadOfHousehold },
        { householdId: null, isHeadOfHousehold: false },
      );
    }
    await this.prisma.household.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'household', id, existing);
    return { ok: true };
  }

  // ── Members ───────────────────────────────────────────────────────────────

  /** Moves a donor into the household; only one member may be head. */
  async addMember(id: string, input: HouseholdMemberInput, user: AuthenticatedUser) {
    const userId = user.id;
    const household = await this.get(id, user); // 404 + chapter check
    const donor = await this.prisma.donor.findFirst({
      where: { id: input.donorId, deletedAt: null },
    });
    if (!donor) throw new BadRequestException('Donor not found');
    // Chapter scoping (§7.2): the donor must be reachable by the user AND live
    // in the household's chapter — households never span chapters.
    assertChapterAccess(user.chapter, donor.chapterState);
    if (donor.chapterState !== household.chapterState) {
      throw new BadRequestException('Donor belongs to a different chapter than the household');
    }

    const isHead = input.isHeadOfHousehold ?? false;
    if (isHead) {
      // Only one head per household — demote (and audit) any incumbent.
      const demoted = await this.prisma.donor.findMany({
        where: { householdId: id, id: { not: input.donorId }, isHeadOfHousehold: true },
        select: { id: true },
      });
      for (const other of demoted) {
        await this.prisma.donor.update({
          where: { id: other.id },
          data: { isHeadOfHousehold: false, updatedById: userId },
        });
        await this.audit.logUpdate(
          userId,
          'donor',
          other.id,
          { isHeadOfHousehold: true },
          { isHeadOfHousehold: false },
        );
      }
    }
    const updated = await this.prisma.donor.update({
      where: { id: input.donorId },
      data: { householdId: id, isHeadOfHousehold: isHead, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'donor', input.donorId, donor, updated);
    return updated;
  }

  async removeMember(id: string, donorId: string, user: AuthenticatedUser) {
    const userId = user.id;
    await this.get(id, user); // 404 + chapter check
    const donor = await this.prisma.donor.findFirst({
      where: { id: donorId, deletedAt: null },
    });
    if (!donor) throw new BadRequestException('Donor not found');
    // Chapter scoping (§7.2): never mutate a donor outside the user's chapter,
    // even one that drifted into this household's roster.
    assertChapterAccess(user.chapter, donor.chapterState);
    if (donor.householdId !== id) {
      throw new BadRequestException('Donor is not a member of this household');
    }
    const updated = await this.prisma.donor.update({
      where: { id: donorId },
      data: { householdId: null, isHeadOfHousehold: false, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'donor', donorId, donor, updated);
    return { ok: true };
  }
}
