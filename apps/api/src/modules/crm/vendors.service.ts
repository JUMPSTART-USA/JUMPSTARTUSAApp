import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ListQuery, VendorInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface VendorListFilters {
  active?: boolean;
  isReferralPartner?: boolean;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'city', 'state', 'active', 'createdAt']);

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: VendorListFilters) {
    const where: Prisma.VendorWhereInput = {
      deletedAt: null,
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.isReferralPartner !== undefined
        ? { isReferralPartner: filters.isReferralPartner }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { contactPerson: { contains: query.search, mode: 'insensitive' } },
              { servicesProvided: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.VendorOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, deletedAt: null },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async create(input: VendorInput, userId: string) {
    const vendor = await this.prisma.vendor.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'vendor', vendor.id, vendor);
    return vendor;
  }

  async update(id: string, input: Partial<VendorInput>, userId: string) {
    const existing = await this.get(id);
    const updated = await this.prisma.vendor.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'vendor', id, existing, updated);
    return updated;
  }

  // Soft delete only — referrals (§6.5) and maintenance records (§6.10) keep
  // their vendor link.
  async softDelete(id: string, userId: string) {
    const existing = await this.get(id);
    await this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'vendor', id, existing);
    return { ok: true };
  }
}
