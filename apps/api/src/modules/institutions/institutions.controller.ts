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
  institutionSchema,
  listQuerySchema,
  US_STATES,
  type InstitutionInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { InstitutionsService } from './institutions.service';

const listFiltersSchema = listQuerySchema.extend({
  state: z.enum(US_STATES).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get()
  @RequirePermission('institutions.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { state, active, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.institutions.list(listQuery as ListQuery, {
      state: (user.chapter ?? state) as ListFilters['state'],
      active,
    });
  }

  @Get(':id')
  @RequirePermission('institutions.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.institutions.get(id);
  }

  @Get(':id/profile')
  @RequirePermission('institutions.read')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.institutions.profile(id);
  }

  @Post()
  @RequirePermission('institutions.create')
  create(
    @Body(zodBody(institutionSchema)) body: InstitutionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutions.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('institutions.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(institutionSchema.partial())) body: Partial<InstitutionInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutions.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('institutions.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.institutions.softDelete(id, user.id);
  }
}
