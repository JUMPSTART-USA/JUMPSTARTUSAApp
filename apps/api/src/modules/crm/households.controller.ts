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
  CHAPTER_STATES,
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

const listFiltersSchema = listQuerySchema.extend({
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('households')
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get()
  @RequirePermission('donors.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.households.list(listQuery as ListQuery, {
      state: (user.chapter ?? state) as ListFilters['state'],
    });
  }

  @Get(':id')
  @RequirePermission('donors.read')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.households.detail(id, user);
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(householdSchema)) body: HouseholdInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.households.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(householdSchema.partial())) body: Partial<HouseholdInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.households.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.households.softDelete(id, user);
  }

  // Membership changes are an edit of the donor record — 'donors.update'.
  @Post(':id/members')
  @RequirePermission('donors.update')
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(memberSchema)) body: HouseholdMemberInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.households.addMember(id, body, user);
  }

  @Delete(':id/members/:donorId')
  @RequirePermission('donors.update')
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('donorId', ParseUUIDPipe) donorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.households.removeMember(id, donorId, user);
  }
}
