import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ListQuery, PledgeInput, PledgeStatus, SchedulePaymentInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DonationsService } from './donations.service';
import { pledgeComputed } from './giving.util';

export interface PledgeListFilters {
  donorId?: string;
  status?: PledgeStatus;
  campaignId?: string;
  fundId?: string;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['pledgeDate', 'totalAmount', 'status', 'startDate', 'createdAt']);

@Injectable()
export class PledgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly donations: DonationsService,
  ) {}

  async list(query: ListQuery, filters: PledgeListFilters) {
    const where: Prisma.PledgeWhereInput = {
      deletedAt: null,
      ...(filters.donorId ? { donorId: filters.donorId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.fundId ? { fundId: filters.fundId } : {}),
      ...(query.search
        ? { donor: { name: { contains: query.search, mode: 'insensitive' } } }
        : {}),
    };

    const orderBy: Prisma.PledgeOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { pledgeDate: 'desc' };

    const [pledges, total] = await this.prisma.$transaction([
      this.prisma.pledge.findMany({
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
      this.prisma.pledge.count({ where }),
    ]);

    // Balance/arrears are computed from payments — never stored.
    const paid = pledges.length
      ? await this.prisma.donation.groupBy({
          by: ['pledgeId'],
          where: { pledgeId: { in: pledges.map((p) => p.id) }, deletedAt: null },
          _sum: { amount: true },
        })
      : [];
    const paidByPledge = new Map(paid.map((s) => [s.pledgeId, Number(s._sum.amount ?? 0)]));

    const today = new Date();
    const items = pledges.map((pledge) => ({
      ...pledge,
      ...pledgeComputed(pledge, paidByPledge.get(pledge.id) ?? 0, today),
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const pledge = await this.prisma.pledge.findFirst({ where: { id, deletedAt: null } });
    if (!pledge) throw new NotFoundException('Pledge not found');
    return pledge;
  }

  /** Pledge detail: schedule math + the payment history behind it. */
  async detail(id: string) {
    const pledge = await this.prisma.pledge.findFirst({
      where: { id, deletedAt: null },
      include: {
        donor: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
        fund: { select: { id: true, name: true } },
        appeal: { select: { id: true, name: true } },
      },
    });
    if (!pledge) throw new NotFoundException('Pledge not found');

    const payments = await this.prisma.donation.findMany({
      where: { pledgeId: id, deletedAt: null },
      orderBy: { donationDate: 'desc' },
      include: { fund: { select: { id: true, name: true } } },
    });

    const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    return {
      ...pledge,
      ...pledgeComputed(pledge, amountPaid, new Date()),
      payments,
    };
  }

  async create(input: PledgeInput, userId: string) {
    await this.assertLinksExist(input);
    if (
      input.writtenOffAmount !== null &&
      input.writtenOffAmount !== undefined &&
      Number(input.writtenOffAmount) > Number(input.totalAmount)
    ) {
      throw new BadRequestException('Write-off cannot exceed the pledge total');
    }
    const pledge = await this.prisma.pledge.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'pledge', pledge.id, pledge);
    return pledge;
  }

  async update(id: string, input: Partial<PledgeInput>, userId: string) {
    const existing = await this.get(id);
    await this.assertLinksExist(input);

    // Recorded payments carry the pledge's donor — repointing the schedule
    // would split the two sides across donors (mirrors the softDelete guard).
    if (input.donorId && input.donorId !== existing.donorId) {
      const payments = await this.prisma.donation.count({
        where: { pledgeId: id, deletedAt: null },
      });
      if (payments > 0) {
        throw new ConflictException('Pledge has recorded payments — its donor cannot be changed');
      }
    }

    // The schema's cross-field refinements only see the payload — re-check merged.
    const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
    const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('End date cannot be before start date');
    }
    const totalAmount =
      input.totalAmount !== undefined ? Number(input.totalAmount) : Number(existing.totalAmount);
    const installment =
      input.installmentAmount !== undefined ? input.installmentAmount : existing.installmentAmount;
    if (installment !== null && installment !== undefined && Number(installment) > totalAmount) {
      throw new BadRequestException('Installment cannot exceed the pledge total');
    }
    const status = input.status !== undefined ? input.status : existing.status;
    const writtenOff =
      input.writtenOffAmount !== undefined ? input.writtenOffAmount : existing.writtenOffAmount;
    if (status === 'written_off' && (writtenOff === null || writtenOff === undefined)) {
      throw new BadRequestException('Enter the amount being written off');
    }
    if (writtenOff !== null && writtenOff !== undefined && Number(writtenOff) > totalAmount) {
      throw new BadRequestException('Write-off cannot exceed the pledge total');
    }

    const updated = await this.prisma.pledge.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'pledge', id, existing, updated);

    // Total/write-off/status edits move the fulfillment threshold — re-run the
    // active↔fulfilled auto-flip so the stored status matches the invariant.
    if (
      input.totalAmount !== undefined ||
      input.writtenOffAmount !== undefined ||
      input.status !== undefined
    ) {
      await this.donations.recomputePledgeStatus(id, userId);
      return this.get(id);
    }
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.get(id);
    const payments = await this.prisma.donation.count({
      where: { pledgeId: id, deletedAt: null },
    });
    if (payments > 0) {
      throw new ConflictException('Pledge has recorded payments — cancel or write it off instead');
    }
    await this.prisma.pledge.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'pledge', id, existing);
    return { ok: true };
  }

  /**
   * Records an installment as a Donation carrying pledgeId, inheriting the
   * pledge's designations unless overridden. Fulfillment flips automatically
   * inside the donation create path.
   */
  async recordPayment(id: string, input: SchedulePaymentInput, userId: string) {
    const pledge = await this.get(id);
    return this.donations.create(
      {
        donorId: pledge.donorId,
        donationDate: input.donationDate,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        isRecurring: false,
        receiptSent: input.receiptSent,
        isAnonymous: false,
        pledgeId: id,
        campaignId: input.campaignId !== undefined ? input.campaignId : pledge.campaignId,
        fundId: input.fundId !== undefined ? input.fundId : pledge.fundId,
        appealId: input.appealId !== undefined ? input.appealId : pledge.appealId,
        notes: input.notes,
      },
      userId,
    );
  }

  private async assertLinksExist(input: Partial<PledgeInput>) {
    if (input.donorId) {
      const donor = await this.prisma.donor.findFirst({
        where: { id: input.donorId, deletedAt: null },
      });
      if (!donor) throw new BadRequestException('Donor not found');
    }
    if (input.campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: input.campaignId, deletedAt: null },
      });
      if (!campaign) throw new BadRequestException('Campaign not found');
    }
    if (input.fundId) {
      const fund = await this.prisma.fund.findFirst({ where: { id: input.fundId } });
      if (!fund) throw new BadRequestException('Fund not found');
    }
    if (input.appealId) {
      const appeal = await this.prisma.appeal.findFirst({
        where: { id: input.appealId, deletedAt: null },
      });
      if (!appeal) throw new BadRequestException('Appeal not found');
    }
  }
}
