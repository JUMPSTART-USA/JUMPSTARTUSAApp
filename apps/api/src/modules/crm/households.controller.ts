import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  householdSchema,
  listQuerySchema,
  uuid,
  type HouseholdInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { HouseholdsService, type HouseholdMemberInput } from './households.service';

const memberSchema = z.object({
  donorId: uuid,
  isHeadOfHousehold: z.boolean().optional(),
});

@Controller('households')
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get()
  @RequirePermission('donors.read')
  list(@Query(zodQuery(listQuerySchema)) query: ListQuery) {
    return this.households.list(query);
  }

  @Get(':id')
  @RequirePermission('donors.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.households.detail(id);
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(householdSchema)) body: HouseholdInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.households.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(householdSchema.partial())) body: Partial<HouseholdInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.households.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.households.softDelete(id, user.id);
  }

  // Membership changes are an edit of the donor record — 'donors.update'.
  @Post(':id/members')
  @RequirePermission('donors.update')
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(memberSchema)) body: HouseholdMemberInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.households.addMember(id, body, user.id);
  }

  @Delete(':id/members/:donorId')
  @RequirePermission('donors.update')
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('donorId', ParseUUIDPipe) donorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.households.removeMember(id, donorId, user.id);
  }
}
