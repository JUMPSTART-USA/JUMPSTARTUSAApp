import { Module } from '@nestjs/common';
import { AdminAuditLogsController } from './audit-logs.controller';
import { AdminAuditLogsService } from './audit-logs.service';
import { AdminRolesController } from './roles.controller';
import { AdminRolesService } from './roles.service';
import { AdminSettingsController } from './settings.controller';
import { AdminSettingsService } from './settings.service';
import { AdminTemplatesController } from './templates.controller';
import { AdminTemplatesService } from './templates.service';
import { AdminUsersController } from './users.controller';
import { AdminUsersService } from './users.service';

@Module({
  controllers: [
    AdminUsersController,
    AdminRolesController,
    AdminAuditLogsController,
    AdminSettingsController,
    AdminTemplatesController,
  ],
  providers: [
    AdminUsersService,
    AdminRolesService,
    AdminAuditLogsService,
    AdminSettingsService,
    AdminTemplatesService,
  ],
  exports: [AdminSettingsService],
})
export class AdminModule {}
