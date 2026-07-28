import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CHAPTER_STATES,
  createUserSchema,
  listQuerySchema,
  updateUserSchema,
  USER_STATUSES,
  uuid,
  type CreateUserInput,
  type ListQuery,
  type UpdateUserInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { AdminUsersService } from './users.service';

const listFiltersSchema = listQuerySchema.extend({
  status: z.enum(USER_STATUSES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const deactivateSchema = z.object({ reassignToUserId: uuid });
type DeactivateInput = z.infer<typeof deactivateSchema>;

// One chapter or all: at most one scope row; empty = all chapters (§7.2).
const regionScopesSchema = z.object({
  states: z.array(z.enum(CHAPTER_STATES)).max(1, 'Assign one chapter, or none for all chapters'),
});
type RegionScopesInput = z.infer<typeof regionScopesSchema>;

@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @RequirePermission('admin.users')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { status, ...listQuery } = query;
    return this.users.list(listQuery as ListQuery, { status });
  }

  @Get(':id')
  @RequirePermission('admin.users')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  @RequirePermission('admin.users')
  create(
    @Body(zodBody(createUserSchema)) body: CreateUserInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.create(body, user.id);
  }

  /** Role changes go through this PATCH too — no separate roles endpoint. */
  @Patch(':id')
  @RequirePermission('admin.users')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateUserSchema)) body: UpdateUserInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.update(id, body, user.id);
  }

  @Post(':id/deactivate')
  @RequirePermission('admin.users')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(deactivateSchema)) body: DeactivateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.deactivate(id, body.reassignToUserId, user.id);
  }

  @Post(':id/reactivate')
  @RequirePermission('admin.users')
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.reactivate(id, user.id);
  }

  @Post(':id/resend-invite')
  @RequirePermission('admin.users')
  resendInvite(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.resendInvite(id, user.id);
  }

  @Get(':id/region-scopes')
  @RequirePermission('admin.users')
  getRegionScopes(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getRegionScopes(id);
  }

  @Put(':id/region-scopes')
  @RequirePermission('admin.users')
  setRegionScopes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(regionScopesSchema)) body: RegionScopesInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.setRegionScopes(id, body.states, user.id);
  }
}
