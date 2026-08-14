import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ListQuery, VendorInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { applyMailingSameRule } from '../../common/mailing.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface VendorListFilters {
  active?: boolean;
  isReferralPartner?: boolean;
  /** Chapter filter — matches the `chapterState` column, NOT the postal state. */
  chapterState?: string;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'city', 'state', 'chapterState', 'active', 'createdAt']);

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
      ...(filters.chapterState ? { chapterState: filters.chapterState } : {}),
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

  async get(id: string, user: AuthenticatedUser) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, deletedAt: null },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    // Chapter scoping (§7.2): same derivation as the list filter
    // (own chapterState — the postal `state` is just address data).
    assertChapterAccess(user.chapter, vendor.chapterState);
    return vendor;
  }

  async create(input: VendorInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): the creator decides the chapter — scoped users
    // get theirs stamped, all-chapters users must pick one.
    const chapterState = resolveCreateChapter(user.chapter, input.chapterState);
    const vendor = await this.prisma.vendor.create({
      data: {
        ...applyMailingSameRule(input, true),
        chapterState,
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'vendor', vendor.id, vendor);
    return vendor;
  }

  async update(id: string, input: Partial<VendorInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    // ...and a scoped user cannot move the record to another chapter either.
    assertChapterAccess(user.chapter, input.chapterState);
    const updated = await this.prisma.vendor.update({
      where: { id },
      data: { ...applyMailingSameRule(input, existing.mailingSameAsPrimary), updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'vendor', id, existing, updated);
    return updated;
  }

  // Soft delete only — referrals (§6.5) and maintenance records (§6.10) keep
  // their vendor link.
  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    await this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'vendor', id, existing);
    return { ok: true };
  }
}
