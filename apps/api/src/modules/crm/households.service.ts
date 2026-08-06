import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { HouseholdInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { roundMoney } from './giving.util';

export interface HouseholdMemberInput {
  donorId: string;
  isHeadOfHousehold?: boolean;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'createdAt']);

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery) {
    const where: Prisma.HouseholdWhereInput = {
      deletedAt: null,
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

  async get(id: string) {
    const household = await this.prisma.household.findFirst({ where: { id, deletedAt: null } });
    if (!household) throw new NotFoundException('Household not found');
    return household;
  }

  /** Household detail: members with per-member lifetime giving + totals. */
  async detail(id: string) {
    const household = await this.get(id);

    const members = await this.prisma.donor.findMany({
      where: { householdId: id, deletedAt: null },
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

  async create(input: HouseholdInput, userId: string) {
    const household = await this.prisma.household.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'household', household.id, household);
    return household;
  }

  async update(id: string, input: Partial<HouseholdInput>, userId: string) {
    const existing = await this.get(id);
    const updated = await this.prisma.household.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'household', id, existing, updated);
    return updated;
  }

  /** Soft delete — members are released, their donor records untouched otherwise. */
  async softDelete(id: string, userId: string) {
    const existing = await this.get(id);
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
  async addMember(id: string, input: HouseholdMemberInput, userId: string) {
    await this.get(id);
    const donor = await this.prisma.donor.findFirst({
      where: { id: input.donorId, deletedAt: null },
    });
    if (!donor) throw new BadRequestException('Donor not found');

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

  async removeMember(id: string, donorId: string, userId: string) {
    await this.get(id);
    const donor = await this.prisma.donor.findFirst({
      where: { id: donorId, deletedAt: null },
    });
    if (!donor) throw new BadRequestException('Donor not found');
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
