import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { AdminSettingsService } from './settings.service';

// Dotted lowercase key, e.g. 'org.info'. Validated as a pipe on the route
// param — keys are identifiers, not user text.
const settingKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9_-]+)*$/, 'Invalid setting key')
  .max(100);

// null is rejected: AppSetting.value is a non-nullable Json column, and a
// "cleared" setting should simply hold an empty object/array instead.
const settingValueSchema = z.object({
  value: z.unknown().refine((v) => v !== undefined && v !== null, 'value is required'),
});

@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  @RequirePermission('admin.settings')
  list() {
    return this.settings.list();
  }

  @Put(':key')
  @RequirePermission('admin.settings')
  upsert(
    @Param('key', zodBody(settingKeySchema)) key: string,
    @Body(zodBody(settingValueSchema)) body: { value: unknown },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settings.upsert(key, body.value, user.id);
  }
}
