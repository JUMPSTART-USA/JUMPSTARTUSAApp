import { BadRequestException, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types';
import { BloomerangSyncService } from './bloomerang-sync.service';
import { DonorCrmConfigService } from './donor-crm-config.service';
import { NeonCrmSyncService } from './neoncrm-sync.service';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly bloomerang: BloomerangSyncService,
    private readonly neoncrm: NeonCrmSyncService,
    private readonly config: DonorCrmConfigService,
  ) {}

  // Chip payload: active provider + its latest run — readable by anyone who
  // can see the mirrored donor data, not just admins.
  @Get('status')
  @RequirePermission('donors.read')
  status() {
    return this.config.status();
  }

  // Admin payload for the Settings integrations card: every provider with its
  // credential state and the env var names to set.
  @Get('config')
  @RequirePermission('admin.settings')
  configView() {
    return this.config.config();
  }

  @Post('bloomerang')
  @RequirePermission('admin.settings')
  async syncBloomerang(@CurrentUser() user: AuthenticatedUser) {
    await this.assertActive('bloomerang');
    return this.bloomerang.syncNow(user.id);
  }

  @Post('neoncrm')
  @RequirePermission('admin.settings')
  async syncNeonCrm(@CurrentUser() user: AuthenticatedUser) {
    await this.assertActive('neoncrm');
    return this.neoncrm.syncNow(user.id);
  }

  // Feeds the "last synced" dashboard note; all targets unless filtered.
  @Get('runs')
  @RequirePermission('donors.read')
  runs(@Query('target') target?: string) {
    return this.config.listRuns(target);
  }

  private async assertActive(provider: 'bloomerang' | 'neoncrm') {
    const active = await this.config.activeProvider();
    if (active !== provider) {
      throw new BadRequestException(
        `${provider} is not the active donor CRM (currently: ${active}) — change it under Admin → Settings → Integrations`,
      );
    }
  }
}
