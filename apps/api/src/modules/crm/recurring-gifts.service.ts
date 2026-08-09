import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  ListQuery,
  RecurringGiftInput,
  RecurringGiftStatus,
  SchedulePaymentInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { DonationsService } from './donations.service';
import { roundMoney, startOfUtcDay } from './giving.util';

export interface RecurringGiftListFilters {
  /** Chapter (§7.2) — forced to the user's chapter in the controller. */
  state?: string;
  donorId?: string;
  status?: RecurringGiftStatus;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['amount', 'frequency', 'startDate', 'nextGiftDate', 'status', 'createdAt']);

@Injectable()
export class RecurringGiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly donations: DonationsService,
  ) {}

  async list(query: ListQuery, filters: RecurringGiftListFilters) {
    const where: Prisma.RecurringGiftWhereInput = {
      deletedAt: null,
      ...(filters.donorId ? { donorId: filters.donorId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      // Chapter scoping (§7.2): schedules derive chapter through their
      // required donor — the donor-name search rides the same join.
      ...(filters.state || query.search
        ? {
            donor: {
              ...(filters.state ? { chapterState: filters.state } : {}),
              ...(query.search
                ? { name: { contains: query.search, mode: 'insensitive' as const } }
                : {}),
            },
          }
        : {}),
    };

    const orderBy: Prisma.RecurringGiftOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { startDate: 'desc' };

    const [gifts, total] = await this.prisma.$transaction([
      this.prisma.recurringGift.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          donor: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          fund: { select: { id: true, name: true } },
          appeal: { select: { id: true, name: true } },
        },
      }),
      this.prisma.recurringGift.count({ where }),
    ]);

    // Payment history is computed from linked donations — never stored.
    const stats = gifts.length
      ? await this.prisma.donation.groupBy({
          by: ['recurringGiftId'],
          where: { recurringGiftId: { in: gifts.map((g) => g.id) }, deletedAt: null },
          _sum: { amount: true },
          _count: { _all: true },
          _max: { donationDate: true },
        })
      : [];
    const byGift = new Map(stats.map((s) => [s.recurringGiftId, s]));

    const today = startOfUtcDay(new Date());
    const items = gifts.map((gift) => {
      const s = byGift.get(gift.id);
      return {
        ...gift,
        lastPaymentDate: s?._max.donationDate ?? null,
        paymentCount: s?._count._all ?? 0,
        totalGiven: Number(s?._sum.amount ?? 0),
        isOverdue:
          gift.status === 'active' && gift.nextGiftDate !== null && gift.nextGiftDate < today,
      };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const found = await this.prisma.recurringGift.findFirst({
      where: { id, deletedAt: null },
      include: { donor: { select: { chapterState: true } } },
    });
    if (!found) throw new NotFoundException('Recurring gift not found');
    // Chapter scoping (§7.2): derived through the required donor.
    assertChapterAccess(user.chapter, found.donor.chapterState);
    const { donor: _donor, ...gift } = found;
    return gift;
  }

  /** Recurring-gift detail: the schedule plus its collected payments. */
  async detail(id: string, user: AuthenticatedUser) {
    const gift = await this.prisma.recurringGift.findFirst({
      where: { id, deletedAt: null },
      include: {
        donor: { select: { id: true, name: true, chapterState: true } },
        campaign: { select: { id: true, name: true } },
        fund: { select: { id: true, name: true } },
        appeal: { select: { id: true, name: true } },
      },
    });
    if (!gift) throw new NotFoundException('Recurring gift not found');
    // Chapter scoping (§7.2): derived through the required donor.
    assertChapterAccess(user.chapter, gift.donor.chapterState);

    const payments = await this.prisma.donation.findMany({
      where: { recurringGiftId: id, deletedAt: null },
      orderBy: { donationDate: 'desc' },
      include: { fund: { select: { id: true, name: true } } },
    });

    const today = startOfUtcDay(new Date());
    return {
      ...gift,
      payments,
      lastPaymentDate: payments[0]?.donationDate ?? null,
      paymentCount: payments.length,
      totalGiven: roundMoney(payments.reduce((sum, p) => sum + Number(p.amount), 0)),
      isOverdue:
        gift.status === 'active' && gift.nextGiftDate !== null && gift.nextGiftDate < today,
    };
  }

  async create(input: RecurringGiftInput, user: AuthenticatedUser) {
    const userId = user.id;
    await this.assertLinksExist(input, user);
    const gift = await this.prisma.recurringGift.create({
      data: {
        ...input,
        // A new schedule's first gift is expected at the start date.
        nextGiftDate: input.nextGiftDate ?? input.startDate,
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'recurring_gift', gift.id, gift);
    return gift;
  }

  async update(id: string, input: Partial<RecurringGiftInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user);
    await this.assertLinksExist(input, user, existing.donorId);

    // Recorded payments carry the schedule's donor — repointing it would
    // split the two sides across donors (mirrors the softDelete guard).
    if (input.donorId && input.donorId !== existing.donorId) {
      const payments = await this.prisma.donation.count({
        where: { recurringGiftId: id, deletedAt: null },
      });
      if (payments > 0) {
        throw new ConflictException(
          'Recurring gift has recorded payments — its donor cannot be changed',
        );
      }
    }

    // The schema's end>=start refinement only sees the payload — re-check merged.
    const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
    const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('End date cannot be before start date');
    }

    // Pausing keeps nextGiftDate so resuming picks the schedule back up;
    // closing stamps the end date if one wasn't given.
    const closing = input.status === 'closed' && existing.status !== 'closed';
    const mergedEnd = input.endDate !== undefined ? input.endDate : existing.endDate;

    const updated = await this.prisma.recurringGift.update({
      where: { id },
      data: {
        ...input,
        ...(closing && !mergedEnd ? { endDate: startOfUtcDay(new Date()) } : {}),
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'recurring_gift', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user);
    const payments = await this.prisma.donation.count({
      where: { recurringGiftId: id, deletedAt: null },
    });
    if (payments > 0) {
      throw new ConflictException('Recurring gift has recorded payments — close it instead');
    }
    await this.prisma.recurringGift.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'recurring_gift', id, existing);
    return { ok: true };
  }

  /**
   * Records a collected payment as a Donation carrying recurringGiftId,
   * inheriting the schedule's designations unless overridden. The donation
   * create path advances nextGiftDate.
   */
  async recordPayment(id: string, input: SchedulePaymentInput, user: AuthenticatedUser) {
    // Chapter scoping (§7.2): get() asserts the schedule's donor chapter.
    const gift = await this.get(id, user);
    return this.donations.create(
      {
        donorId: gift.donorId,
        donationDate: input.donationDate,
        amount: input.amount,
        paymentMethod: input.paymentMethod ?? gift.paymentMethod ?? undefined,
        isRecurring: true,
        receiptSent: input.receiptSent,
        isAnonymous: false,
        recurringGiftId: id,
        campaignId: input.campaignId !== undefined ? input.campaignId : gift.campaignId,
        fundId: input.fundId !== undefined ? input.fundId : gift.fundId,
        appealId: input.appealId !== undefined ? input.appealId : gift.appealId,
        notes: input.notes,
      },
      user,
    );
  }

  private async assertLinksExist(
    input: Partial<RecurringGiftInput>,
    user: AuthenticatedUser,
    existingDonorId?: string,
  ) {
    // Resolve the MERGED donor's chapter first — the schedule's chapter
    // follows its donor, and every linked designation must stay in it.
    let donorChapter: string | null = null;
    if (input.donorId) {
      const donor = await this.prisma.donor.findFirst({
        where: { id: input.donorId, deletedAt: null },
      });
      if (!donor) throw new BadRequestException('Donor not found');
      // Chapter scoping (§7.2): a scoped user cannot start a schedule for
      // another chapter's donor.
      assertChapterAccess(user.chapter, donor.chapterState);
      donorChapter = donor.chapterState;
    } else if (existingDonorId && (input.campaignId || input.appealId)) {
      const donor = await this.prisma.donor.findFirst({ where: { id: existingDonorId } });
      donorChapter = donor?.chapterState ?? null;
    }
    if (input.campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: input.campaignId, deletedAt: null },
      });
      if (!campaign) throw new BadRequestException('Campaign not found');
      if (donorChapter && campaign.chapterState !== donorChapter) {
        throw new BadRequestException(
          "Campaign belongs to a different chapter than the schedule's donor",
        );
      }
    }
    if (input.fundId) {
      const fund = await this.prisma.fund.findFirst({ where: { id: input.fundId } });
      if (!fund) throw new BadRequestException('Fund not found');
    }
    if (input.appealId) {
      const appeal = await this.prisma.appeal.findFirst({
        where: { id: input.appealId, deletedAt: null },
        include: { campaign: { select: { chapterState: true } } },
      });
      if (!appeal) throw new BadRequestException('Appeal not found');
      // A standalone appeal (no campaign) is org-global and matches any donor.
      if (donorChapter && appeal.campaign && appeal.campaign.chapterState !== donorChapter) {
        throw new BadRequestException(
          "Appeal belongs to a different chapter than the schedule's donor",
        );
      }
    }
  }
}
