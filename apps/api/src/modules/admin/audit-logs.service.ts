import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@jumpstart/database';
import type { ListQuery } from '@jumpstart/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogFilters {
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
  from?: Date;
  to?: Date;
}

/**
 * Read-only viewer over the append-only audit trail (§6.14, §4.1.5). No other
 * verbs exist here or anywhere — audit rows are never updated or deleted.
 */
@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQuery, filters: AuditLogFilters) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    // Always newest first — sortBy/sortDir are deliberately ignored.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
