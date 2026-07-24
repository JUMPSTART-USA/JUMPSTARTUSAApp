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
import {
  createUserSchema,
  listQuerySchema,
  updateUserSchema,
  US_STATES,
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

const regionScopesSchema = z.object({ states: z.array(z.enum(US_STATES)) });
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
