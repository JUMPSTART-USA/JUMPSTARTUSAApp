import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ListQuery, OutboundReferralInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { assertParticipant } from './participant.util';

export interface ReferralListFilters {
  participantProfileId?: string;
  vendorId?: string;
  from?: Date;
  to?: Date;
  state?: string;
}

const SORTABLE = new Set(['referralDate', 'createdAt']);

const REFERRAL_INCLUDE = {
  vendor: { select: { name: true } },
  participantProfile: {
    select: { chapterState: true, person: { select: { firstName: true, lastName: true } } },
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
      // Chapter scoping (§7.2): derived through the participant profile.
      ...(filters.state ? { participantProfile: { chapterState: filters.state } } : {}),
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

  async get(id: string, user: AuthenticatedUser) {
    const referral = await this.prisma.outboundReferral.findFirst({
      where: { id, deletedAt: null },
      include: REFERRAL_INCLUDE,
    });
    if (!referral) throw new NotFoundException('Referral not found');
    // Chapter scoping (§7.2): same derivation as the list filter (participant).
    assertChapterAccess(user.chapter, referral.participantProfile.chapterState);
    return referral;
  }

  private async assertVendor(vendorId: string, user: AuthenticatedUser) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, deletedAt: null },
      select: { chapterState: true },
    });
    if (!vendor) throw new BadRequestException('Unknown partner organization');
    // Chapter scoping (§7.2): no linking a referral to another chapter's
    // vendor (its name is echoed back on the referral).
    assertChapterAccess(user.chapter, vendor.chapterState);
  }

  async create(input: OutboundReferralInput, user: AuthenticatedUser) {
    const userId = user.id;
    await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    if (input.vendorId) await this.assertVendor(input.vendorId, user);
    const referral = await this.prisma.outboundReferral.create({
      data: { ...input, createdById: userId, updatedById: userId },
      include: { vendor: { select: { name: true } } },
    });
    await this.audit.logCreate(userId, 'outbound_referral', referral.id, referral);
    return referral;
  }

  async update(id: string, input: Partial<OutboundReferralInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.getForModify(id, user);
    if (input.participantProfileId) {
      await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    }
    if (input.vendorId) await this.assertVendor(input.vendorId, user);
    const updated = await this.prisma.outboundReferral.update({
      where: { id },
      data: { ...input, updatedById: userId },
      include: { vendor: { select: { name: true } } },
    });
    await this.audit.logUpdate(userId, 'outbound_referral', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.getForModify(id, user);
    await this.prisma.outboundReferral.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'outbound_referral', id, existing);
    return { ok: true };
  }

  /** Fetch-for-mutation with the chapter guard (§7.2) applied once. */
  private async getForModify(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.outboundReferral.findFirst({
      where: { id, deletedAt: null },
      include: { participantProfile: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Referral not found');
    assertChapterAccess(user.chapter, existing.participantProfile.chapterState);
    const { participantProfile: _participantProfile, ...referralOnly } = existing;
    return referralOnly;
  }
}
