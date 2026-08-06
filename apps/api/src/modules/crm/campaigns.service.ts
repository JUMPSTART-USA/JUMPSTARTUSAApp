import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { CampaignInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface CampaignListFilters {
  status?: 'planned' | 'active' | 'completed' | 'canceled';
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'startDate', 'endDate', 'goalAmount', 'status', 'createdAt']);

/** Percent of goal (1 decimal), null when no goal is set. */
function progressPct(goalAmount: Prisma.Decimal | null, raised: number): number | null {
  const goal = goalAmount ? Number(goalAmount) : 0;
  if (!goal) return null;
  return Math.round((raised / goal) * 1000) / 10;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: CampaignListFilters) {
    const where: Prisma.CampaignWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.CampaignOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [campaigns, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    // raised-to-date is COMPUTED from donations — never stored (§6.8).
    const sums = campaigns.length
      ? await this.prisma.donation.groupBy({
          by: ['campaignId'],
          where: { campaignId: { in: campaigns.map((c) => c.id) }, deletedAt: null },
          _sum: { amount: true },
        })
      : [];
    const raisedByCampaign = new Map(sums.map((s) => [s.campaignId, Number(s._sum.amount ?? 0)]));

    const items = campaigns.map((campaign) => {
      const raisedToDate = raisedByCampaign.get(campaign.id) ?? 0;
      return { ...campaign, raisedToDate, progressPct: progressPct(campaign.goalAmount, raisedToDate) };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, deletedAt: null },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async detail(id: string) {
    const campaign = await this.get(id);

    const [agg, events, appeals] = await this.prisma.$transaction([
      this.prisma.donation.aggregate({
        where: { campaignId: id, deletedAt: null },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.event.findMany({
        where: { campaignId: id, deletedAt: null },
        orderBy: { eventDate: 'desc' },
      }),
      this.prisma.appeal.findMany({
        where: { campaignId: id, deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Per-appeal raised-to-date — computed from donations, like the campaign's.
    const appealSums = appeals.length
      ? await this.prisma.donation.groupBy({
          by: ['appealId'],
          where: { appealId: { in: appeals.map((a) => a.id) }, deletedAt: null },
          _sum: { amount: true },
          _count: { _all: true },
        })
      : [];
    const raisedByAppeal = new Map(appealSums.map((s) => [s.appealId, s]));

    const raisedToDate = Number(agg._sum.amount ?? 0);
    return {
      campaign,
      raisedToDate,
      donationCount: agg._count,
      progressPct: progressPct(campaign.goalAmount, raisedToDate),
      events,
      appeals: appeals.map((appeal) => {
        const raised = Number(raisedByAppeal.get(appeal.id)?._sum.amount ?? 0);
        return {
          ...appeal,
          raisedToDate: raised,
          donationCount: raisedByAppeal.get(appeal.id)?._count._all ?? 0,
          progressPct: progressPct(appeal.goalAmount, raised),
        };
      }),
    };
  }

  async create(input: CampaignInput, userId: string) {
    const campaign = await this.prisma.campaign.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'campaign', campaign.id, campaign);
    return campaign;
  }

  async update(id: string, input: Partial<CampaignInput>, userId: string) {
    const existing = await this.get(id);

    // The schema's end>=start refinement only sees the payload; a partial
    // update must be checked against the merged record.
    const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
    const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('End date cannot be before start date');
    }

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'campaign', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.get(id);
    await this.prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'campaign', id, existing);
    return { ok: true };
  }
}
