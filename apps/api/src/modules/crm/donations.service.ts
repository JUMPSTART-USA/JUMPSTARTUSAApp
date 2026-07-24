import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { DonationInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface DonationListFilters {
  donorId?: string;
  campaignId?: string;
  eventId?: string;
  fund?: string;
  isRecurring?: boolean;
  from?: Date;
  to?: Date;
}

export interface DonationSummaryFilters {
  from?: Date;
  to?: Date;
  campaignId?: string;
  donorId?: string;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['donationDate', 'amount', 'createdAt']);

@Injectable()
export class DonationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: DonationListFilters) {
    const where: Prisma.DonationWhereInput = {
      deletedAt: null,
      ...(filters.donorId ? { donorId: filters.donorId } : {}),
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.eventId ? { eventId: filters.eventId } : {}),
      ...(filters.fund ? { fund: { contains: filters.fund, mode: 'insensitive' } } : {}),
      ...(filters.isRecurring !== undefined ? { isRecurring: filters.isRecurring } : {}),
      ...(filters.from || filters.to
        ? {
            donationDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? { donor: { name: { contains: query.search, mode: 'insensitive' } } }
        : {}),
    };

    const orderBy: Prisma.DonationOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { donationDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.donation.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          donor: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          event: { select: { id: true, name: true } },
        },
      }),
      this.prisma.donation.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** CRM reporting: totals by range/campaign/donor over the mirrored data (§6.8). */
  async summary(filters: DonationSummaryFilters) {
    const where: Prisma.DonationWhereInput = {
      deletedAt: null,
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.donorId ? { donorId: filters.donorId } : {}),
      ...(filters.from || filters.to
        ? {
            donationDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    const agg = await this.prisma.donation.aggregate({
      where,
      _count: true,
      _sum: { amount: true },
    });
    return { count: agg._count, total: Number(agg._sum.amount ?? 0) };
  }

  /** Manual entry path for historical import fixes — normal gifts arrive via sync (§6.8). */
  async create(input: DonationInput, userId: string) {
    const donor = await this.prisma.donor.findFirst({
      where: { id: input.donorId, deletedAt: null },
    });
    if (!donor) throw new BadRequestException('Donor not found');

    if (input.campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: input.campaignId, deletedAt: null },
      });
      if (!campaign) throw new BadRequestException('Campaign not found');
    }
    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
      });
      if (!event) throw new BadRequestException('Event not found');
    }

    const donation = await this.prisma.donation.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'donation', donation.id, donation);
    return donation;
  }
}
