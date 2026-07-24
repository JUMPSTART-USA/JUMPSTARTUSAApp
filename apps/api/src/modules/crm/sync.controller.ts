import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types';
import { BloomerangSyncService } from './bloomerang-sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: BloomerangSyncService) {}

  @Post('bloomerang')
  @RequirePermission('admin.settings')
  syncNow(@CurrentUser() user: AuthenticatedUser) {
    return this.sync.syncNow(user.id);
  }

  // Feeds the "last synced" dashboard note — readable by anyone who can see
  // the mirrored donor data, not just admins.
  @Get('runs')
  @RequirePermission('donors.read')
  runs() {
    return this.sync.listRuns();
  }
}
