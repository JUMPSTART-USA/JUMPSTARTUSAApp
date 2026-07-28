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
  listQuerySchema,
  transitionalHomeSchema,
  US_STATES,
  type ListQuery,
  type TransitionalHomeInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { HousingService, type TransitionalHomeUpdate } from './housing.service';

const listFiltersSchema = listQuerySchema.extend({
  state: z.enum(US_STATES).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('transitional-homes')
export class TransitionalHomesController {
  constructor(private readonly housing: HousingService) {}

  @Get()
  @RequirePermission('housing.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { state, active, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.housing.listHomes(listQuery as ListQuery, {
      state: (user.chapter ?? state) as ListFilters['state'],
      active,
    });
  }

  /** Occupancy dashboard (§6.4) — declared before ':id' so it matches first. */
  @Get('occupancy')
  @RequirePermission('housing.read')
  occupancy() {
    return this.housing.occupancy();
  }

  @Get(':id')
  @RequirePermission('housing.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.housing.getHome(id);
  }

  @Post()
  @RequirePermission('housing.create')
  create(
    @Body(zodBody(transitionalHomeSchema)) body: TransitionalHomeInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.housing.createHome(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('housing.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(transitionalHomeSchema.partial())) body: TransitionalHomeUpdate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.housing.updateHome(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('housing.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.housing.softDeleteHome(id, user.id);
  }
}
