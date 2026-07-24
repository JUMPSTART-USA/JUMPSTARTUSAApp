import { Injectable } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * System settings (§6.14) — free-form JSON per key so config shapes can evolve
 * without migrations. Seed-known keys:
 *   'org.info'                   — org name/address/contact block for exports
 *   'mentoring.maxActiveMentees' — cap enforced by the mentoring module (§6.7)
 *   'states.active'              — states/regions the org operates in
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.appSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async upsert(key: string, value: unknown, userId: string) {
    const existing = await this.prisma.appSetting.findUnique({ where: { key } });

    const jsonValue = value as Prisma.InputJsonValue;
    const setting = await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: jsonValue, updatedById: userId },
      create: { key, value: jsonValue, updatedById: userId },
    });

    if (existing) {
      await this.audit.logUpdate(userId, 'app_setting', key, { value: existing.value }, { value });
    } else {
      await this.audit.logCreate(userId, 'app_setting', key, { value });
    }
    return setting;
  }
}
