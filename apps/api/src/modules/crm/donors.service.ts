import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { DonorInput, DonorType, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface DonorListFilters {
  donorType?: DonorType;
  status?: 'active' | 'lapsed' | 'inactive';
}

/**
 * PATCHable donor fields. Donors are a read-mostly Bloomerang mirror — the
 * platform owns only the person link and local notes; every other field syncs
 * from Bloomerang and would be overwritten on the next run (§6.8).
 */
export type DonorLocalUpdate = Partial<Pick<DonorInput, 'personId' | 'notes'>>;

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'donorType', 'status', 'city', 'state', 'createdAt']);

@Injectable()
export class DonorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: DonorListFilters) {
    const where: Prisma.DonorWhereInput = {
      deletedAt: null,
      ...(filters.donorType ? { donorType: filters.donorType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.DonorOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [donors, total] = await this.prisma.$transaction([
      this.prisma.donor.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.donor.count({ where }),
    ]);

    // Lifetime giving / last gift are computed from the mirrored donations —
    // never stored, so they can't drift from Bloomerang (§6.8).
    const stats = donors.length
      ? await this.prisma.donation.groupBy({
          by: ['donorId'],
          where: { donorId: { in: donors.map((d) => d.id) }, deletedAt: null },
          _sum: { amount: true },
          _max: { donationDate: true },
        })
      : [];
    const byDonor = new Map(stats.map((s) => [s.donorId, s]));

    const items = donors.map((donor) => ({
      ...donor,
      lifetimeGiving: Number(byDonor.get(donor.id)?._sum.amount ?? 0),
      lastGiftDate: byDonor.get(donor.id)?._max.donationDate ?? null,
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const donor = await this.prisma.donor.findFirst({
      where: { id, deletedAt: null },
      include: { person: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!donor) throw new NotFoundException('Donor not found');
    return donor;
  }

  /** Donor detail: giving history + campaign/event involvement (§6.8). */
  async detail(id: string) {
    const donor = await this.get(id);

    const donations = await this.prisma.donation.findMany({
      where: { donorId: id, deletedAt: null },
      orderBy: { donationDate: 'desc' },
      include: {
        campaign: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
      },
    });

    // Distinct campaigns/events this donor has given to/through.
    const campaigns = new Map<string, { id: string; name: string }>();
    const events = new Map<string, { id: string; name: string }>();
    for (const d of donations) {
      if (d.campaign) campaigns.set(d.campaign.id, d.campaign);
      if (d.event) events.set(d.event.id, d.event);
    }

    return {
      donor,
      donations,
      lifetimeGiving: donations.reduce((sum, d) => sum + Number(d.amount), 0),
      lastGiftDate: donations[0]?.donationDate ?? null,
      campaigns: [...campaigns.values()],
      events: [...events.values()],
    };
  }

  /** Manual entry path for historical import fixes — normal donors arrive via sync (§6.8). */
  async create(input: DonorInput, userId: string) {
    await this.assertPersonExists(input.personId);
    const donor = await this.prisma.donor.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'donor', donor.id, donor);
    return donor;
  }

  async updateLocal(id: string, input: DonorLocalUpdate, userId: string) {
    const existing = await this.get(id);
    await this.assertPersonExists(input.personId);
    const updated = await this.prisma.donor.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'donor', id, existing, updated);
    return updated;
  }

  private async assertPersonExists(personId?: string) {
    if (!personId) return;
    const person = await this.prisma.person.findFirst({
      where: { id: personId, deletedAt: null },
    });
    if (!person) throw new BadRequestException('Linked person not found');
  }
}
