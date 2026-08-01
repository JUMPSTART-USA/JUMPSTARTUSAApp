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
  US_STATES,
  uuid,
  VOLUNTEER_STATUSES,
  volunteerCreateSchema,
  volunteerUpdateSchema,
  type ListQuery,
  type VolunteerCreateInput,
  type VolunteerUpdateInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { hasPerm, type AuthenticatedUser } from '../../common/types';
import { ScreeningService } from './screening.service';
import { VolunteersService } from './volunteers.service';

const listFiltersSchema = listQuerySchema.extend({
  status: z.enum(VOLUNTEER_STATUSES).optional(),
  isMentor: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  state: z.enum(US_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const eligibilityQuerySchema = z.object({ institutionId: uuid });

// §6.6 dashboard windows are fixed at 30/60/90 days.
const expirationsQuerySchema = z.object({
  days: z.enum(['30', '60', '90']).default('30').transform(Number),
});

const canReadChecks = (user: AuthenticatedUser) =>
  hasPerm(user, 'fields.background_checks.read');

@Controller('volunteers')
export class VolunteersController {
  constructor(
    private readonly volunteers: VolunteersService,
    private readonly screening: ScreeningService,
  ) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { status, isMentor, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.volunteers.list(
      listQuery as ListQuery,
      { status, isMentor, state: (user.chapter ?? state) as ListFilters['state'] },
      canReadChecks(user),
    );
  }

  // Static path — must be declared before the ':id' routes below.
  @Get('expirations')
  @RequirePermission('volunteers.read')
  expirations(
    @Query(zodQuery(expirationsQuerySchema)) query: { days: number },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.expirations(query.days, canReadChecks(user));
  }

  @Get(':id')
  @RequirePermission('volunteers.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.get(id, user, canReadChecks(user));
  }

  @Get(':id/eligibility')
  @RequirePermission('volunteers.read')
  eligibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zodQuery(eligibilityQuerySchema)) query: { institutionId: string },
  ) {
    return this.screening.computeEligibility(id, query.institutionId);
  }

  @Get(':id/service-history')
  @RequirePermission('volunteers.read')
  serviceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.volunteers.serviceHistory(id);
  }

  @Post()
  @RequirePermission('volunteers.create')
  create(
    @Body(zodBody(volunteerCreateSchema)) body: VolunteerCreateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(volunteerUpdateSchema)) body: VolunteerUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.softDelete(id, user);
  }
}
