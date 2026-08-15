import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { AppealInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { progressPct } from './giving.util';

export interface AppealListFilters {
  /** Chapter (§7.2) — forced to the user's chapter in the controller. */
  state?: string;
  campaignId?: string;
  active?: boolean;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'startDate', 'endDate', 'goalAmount', 'isActive', 'createdAt']);

@Injectable()
export class AppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: AppealListFilters) {
    const where: Prisma.AppealWhereInput = {
      deletedAt: null,
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.active !== undefined ? { isActive: filters.active } : {}),
      // Chapter scoping (§7.2): appeals inherit their campaign's chapter;
      // standalone appeals (no campaign) are org-global and visible to all.
      // Wrapped in AND so it cannot collide with the search OR below.
      ...(filters.state
        ? {
            AND: [
              { OR: [{ campaignId: null }, { campaign: { chapterState: filters.state } }] },
            ],
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.AppealOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [appeals, total] = await this.prisma.$transaction([
      this.prisma.appeal.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { campaign: { select: { id: true, name: true } } },
      }),
      this.prisma.appeal.count({ where }),
    ]);

    // Raised-to-date is computed from donations — never stored.
    const sums = appeals.length
      ? await this.prisma.donation.groupBy({
          by: ['appealId'],
          where: {
            appealId: { in: appeals.map((a) => a.id) },
            deletedAt: null,
            // Chapter scoping (§7.2): a scoped viewer's totals only count
            // their chapter's gifts (standalone appeals collect org-wide).
            ...(filters.state ? { donor: { chapterState: filters.state } } : {}),
          },
          _sum: { amount: true },
          _count: { _all: true },
        })
      : [];
    const byAppeal = new Map(sums.map((s) => [s.appealId, s]));

    const items = appeals.map((appeal) => {
      const raisedToDate = Number(byAppeal.get(appeal.id)?._sum.amount ?? 0);
      return {
        ...appeal,
        raisedToDate,
        donationCount: byAppeal.get(appeal.id)?._count._all ?? 0,
        progressPct: progressPct(appeal.goalAmount, raisedToDate),
      };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const found = await this.prisma.appeal.findFirst({
      where: { id, deletedAt: null },
      include: { campaign: { select: { chapterState: true } } },
    });
    if (!found) throw new NotFoundException('Appeal not found');
    // Chapter scoping (§7.2): derived through the linked campaign — a
    // standalone appeal is org-global and passes for everyone.
    assertChapterAccess(user.chapter, found.campaign?.chapterState ?? null);
    const { campaign: _campaign, ...appeal } = found;
    return appeal;
  }

  async create(input: AppealInput, user: AuthenticatedUser) {
    const userId = user.id;
    await this.assertCampaignExists(input.campaignId, user);
    const appeal = await this.prisma.appeal.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'appeal', appeal.id, appeal);
    return appeal;
  }

  async update(id: string, input: Partial<AppealInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user);
    await this.assertCampaignExists(input.campaignId, user);

    // The schema's end>=start refinement only sees the payload; a partial
    // update must be checked against the merged record.
    const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
    const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('End date cannot be before start date');
    }

    const updated = await this.prisma.appeal.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'appeal', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user);
    await this.prisma.appeal.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'appeal', id, existing);
    return { ok: true };
  }

  private async assertCampaignExists(
    campaignId: string | null | undefined,
    user: AuthenticatedUser,
  ) {
    if (!campaignId) return;
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, deletedAt: null },
    });
    if (!campaign) throw new BadRequestException('Campaign not found');
    // Chapter scoping (§7.2): the appeal inherits this campaign's chapter, so
    // a scoped user can only attach appeals to their own chapter's campaigns.
    assertChapterAccess(user.chapter, campaign.chapterState);
  }
}
