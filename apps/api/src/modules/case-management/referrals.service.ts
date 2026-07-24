import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ListQuery, OutboundReferralInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertParticipant } from './participant.util';

export interface ReferralListFilters {
  participantProfileId?: string;
  vendorId?: string;
  from?: Date;
  to?: Date;
}

const SORTABLE = new Set(['referralDate', 'createdAt']);

const REFERRAL_INCLUDE = {
  vendor: { select: { name: true } },
  participantProfile: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} as const;

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: ReferralListFilters) {
    const where: Prisma.OutboundReferralWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
      ...(filters.from || filters.to
        ? {
            referralDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { reason: { contains: query.search, mode: 'insensitive' } },
              { providerName: { contains: query.search, mode: 'insensitive' } },
              { vendor: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.OutboundReferralOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { referralDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.outboundReferral.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: REFERRAL_INCLUDE,
      }),
      this.prisma.outboundReferral.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const referral = await this.prisma.outboundReferral.findFirst({
      where: { id, deletedAt: null },
      include: REFERRAL_INCLUDE,
    });
    if (!referral) throw new NotFoundException('Referral not found');
    return referral;
  }

  private async assertVendor(vendorId: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, deletedAt: null } });
    if (!vendor) throw new BadRequestException('Unknown partner organization');
  }

  async create(input: OutboundReferralInput, userId: string) {
    await assertParticipant(this.prisma, input.participantProfileId);
    if (input.vendorId) await this.assertVendor(input.vendorId);
    const referral = await this.prisma.outboundReferral.create({
      data: { ...input, createdById: userId, updatedById: userId },
      include: { vendor: { select: { name: true } } },
    });
    await this.audit.logCreate(userId, 'outbound_referral', referral.id, referral);
    return referral;
  }

  async update(id: string, input: Partial<OutboundReferralInput>, userId: string) {
    const existing = await this.prisma.outboundReferral.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Referral not found');
    if (input.participantProfileId) await assertParticipant(this.prisma, input.participantProfileId);
    if (input.vendorId) await this.assertVendor(input.vendorId);
    const updated = await this.prisma.outboundReferral.update({
      where: { id },
      data: { ...input, updatedById: userId },
      include: { vendor: { select: { name: true } } },
    });
    await this.audit.logUpdate(userId, 'outbound_referral', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.prisma.outboundReferral.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Referral not found');
    await this.prisma.outboundReferral.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'outbound_referral', id, existing);
    return { ok: true };
  }
}
