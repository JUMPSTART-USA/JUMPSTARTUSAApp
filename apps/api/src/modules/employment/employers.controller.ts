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
  employerSchema,
  HIRING_STATUSES,
  listQuerySchema,
  US_STATES,
  type EmployerInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { EmployersService } from './employers.service';

const listFiltersSchema = listQuerySchema.extend({
  hiringStatus: z.enum(HIRING_STATUSES).optional(),
  industry: z.string().trim().max(200).optional(),
  state: z.enum(US_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('employers')
export class EmployersController {
  constructor(private readonly employers: EmployersService) {}

  @Get()
  @RequirePermission('employers.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { hiringStatus, industry, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.employers.list(listQuery as ListQuery, {
      hiringStatus,
      industry,
      state: (user.chapter ?? state) as ListFilters['state'],
    });
  }

  @Get(':id')
  @RequirePermission('employers.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.employers.get(id, user);
  }

  // The profile exposes participants' employment records, so it needs the
  // employment module's read grant on top of employers.read.
  @Get(':id/profile')
  @RequirePermission('employers.read', 'employment.read')
  profile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.employers.profile(id, user);
  }

  @Post()
  @RequirePermission('employers.create')
  create(
    @Body(zodBody(employerSchema)) body: EmployerInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employers.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('employers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(employerSchema.partial())) body: Partial<EmployerInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employers.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('employers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.employers.softDelete(id, user);
  }
}
