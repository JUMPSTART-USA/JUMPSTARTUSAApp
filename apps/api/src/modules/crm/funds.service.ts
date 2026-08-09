import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { FundInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';

export interface FundListFilters {
  active?: boolean;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'sortOrder', 'isActive', 'createdAt']);

@Injectable()
export class FundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Funds are org-global accounting designations (§7.2) — the rows are never
  // chapter-filtered; only the giving rollups below respect the user's chapter.
  async list(query: ListQuery, filters: FundListFilters, user: AuthenticatedUser) {
    const where: Prisma.FundWhereInput = {
      ...(filters.active !== undefined ? { isActive: filters.active } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const orderBy: Prisma.FundOrderByWithRelationInput[] =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? [{ [query.sortBy]: query.sortDir }]
        : [{ sortOrder: 'asc' }, { name: 'asc' }];

    const [funds, total] = await this.prisma.$transaction([
      this.prisma.fund.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fund.count({ where }),
    ]);

    // Raised-to-date is computed from donations — never stored.
    const sums = funds.length
      ? await this.prisma.donation.groupBy({
          by: ['fundId'],
          where: {
            fundId: { in: funds.map((f) => f.id) },
            deletedAt: null,
            // Chapter scoping (§7.2): a scoped viewer's totals only count
            // their own chapter's gifts (via each gift's required donor).
            ...(user.chapter ? { donor: { chapterState: user.chapter } } : {}),
          },
          _sum: { amount: true },
          _count: { _all: true },
        })
      : [];
    const byFund = new Map(sums.map((s) => [s.fundId, s]));

    const items = funds.map((fund) => ({
      ...fund,
      raisedToDate: Number(byFund.get(fund.id)?._sum.amount ?? 0),
      donationCount: byFund.get(fund.id)?._count._all ?? 0,
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const fund = await this.prisma.fund.findUnique({ where: { id } });
    if (!fund) throw new NotFoundException('Fund not found');
    return fund;
  }

  async create(input: FundInput, userId: string) {
    await this.assertNameAvailable(input.name);
    const fund = await this.prisma.fund.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'fund', fund.id, fund);
    return fund;
  }

  async update(id: string, input: Partial<FundInput>, userId: string) {
    const existing = await this.get(id);
    if (input.name && input.name !== existing.name) {
      await this.assertNameAvailable(input.name, id);
    }
    const updated = await this.prisma.fund.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'fund', id, existing, updated);
    return updated;
  }

  // No deletedAt column: a fund in use can only be deactivated, so history
  // keeps its designation. Hard delete is for unused funds (typos).
  async remove(id: string, userId: string) {
    const existing = await this.get(id);
    const [donations, pledges, recurringGifts] = await this.prisma.$transaction([
      this.prisma.donation.count({ where: { fundId: id } }),
      this.prisma.pledge.count({ where: { fundId: id } }),
      this.prisma.recurringGift.count({ where: { fundId: id } }),
    ]);
    if (donations + pledges + recurringGifts > 0) {
      throw new ConflictException('Fund is referenced by gifts — deactivate it instead');
    }
    await this.prisma.fund.delete({ where: { id } });
    await this.audit.logDelete(userId, 'fund', id, existing);
    return { ok: true };
  }

  /** Fund names are unique — surface a clean 409 instead of a DB error. */
  private async assertNameAvailable(name: string, excludeId?: string) {
    const duplicate = await this.prisma.fund.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) throw new BadRequestException('A fund with this name already exists');
  }
}
