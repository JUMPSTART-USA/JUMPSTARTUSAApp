import { Injectable } from '@nestjs/common';
import {
  DONOR_CRM_LABELS,
  DONOR_CRM_PROVIDERS,
  DONOR_CRM_SETTING_KEY,
  donorCrmSettingSchema,
  type DonorCrmProvider,
} from '@jumpstart/shared';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Which donor CRM the Development module mirrors from (§6.8). The provider
 * choice is an app setting (admin-editable); API credentials are server
 * environment variables so secrets never live in the database.
 */
@Injectable()
export class DonorCrmConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active provider; defaults to Bloomerang for continuity with §6.8. */
  async activeProvider(): Promise<DonorCrmProvider> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: DONOR_CRM_SETTING_KEY },
    });
    const parsed = donorCrmSettingSchema.safeParse(row?.value);
    return parsed.success ? parsed.data.provider : 'bloomerang';
  }

  /** Are the provider's server-side credentials present? */
  envReady(provider: DonorCrmProvider): boolean {
    const env = loadEnv();
    switch (provider) {
      case 'bloomerang':
        return Boolean(env.BLOOMERANG_API_KEY);
      case 'neoncrm':
        return Boolean(env.NEONCRM_ORG_ID && env.NEONCRM_API_KEY);
      case 'none':
        return true;
    }
  }

  /** Chip payload: active provider + latest run for it (donors.read). */
  async status() {
    const provider = await this.activeProvider();
    const latest =
      provider === 'none'
        ? null
        : await this.prisma.syncRun.findFirst({
            where: { target: provider },
            orderBy: { startedAt: 'desc' },
          });
    return {
      provider,
      providerLabel: DONOR_CRM_LABELS[provider],
      configured: this.envReady(provider),
      latest,
    };
  }

  /** Admin payload: every provider with its credential state (admin.settings). */
  async config() {
    const provider = await this.activeProvider();
    return {
      provider,
      settingKey: DONOR_CRM_SETTING_KEY,
      providers: DONOR_CRM_PROVIDERS.map((key) => ({
        key,
        label: DONOR_CRM_LABELS[key],
        envReady: this.envReady(key),
        envVars:
          key === 'bloomerang'
            ? ['BLOOMERANG_API_KEY']
            : key === 'neoncrm'
              ? ['NEONCRM_ORG_ID', 'NEONCRM_API_KEY']
              : [],
      })),
    };
  }

  listRuns(target?: string, limit = 20) {
    return this.prisma.syncRun.findMany({
      where: target ? { target } : undefined,
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}
