import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { AdminRolesService } from './roles.service';

// Keys are validated against ALL_PERMISSIONS in the service so the error can
// name the offending keys; Zod only shapes the payload here.
const setPermissionsSchema = z.object({
  permissionKeys: z.array(z.string().trim().max(100)),
});
type SetPermissionsInput = z.infer<typeof setPermissionsSchema>;

// Role create/delete is deliberately NOT exposed: the 11 system roles are
// seeded; custom roles are a later feature (§6.14).
@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly roles: AdminRolesService) {}

  @Get()
  @RequirePermission('admin.roles')
  list() {
    return this.roles.list();
  }

  @Put(':id/permissions')
  @RequirePermission('admin.roles')
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(setPermissionsSchema)) body: SetPermissionsInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.roles.setPermissions(id, body.permissionKeys, user.id);
  }
}
