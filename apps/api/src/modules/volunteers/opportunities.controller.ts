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
  OPPORTUNITY_STATUSES,
  optionalDate,
  shiftSignupSchema,
  shiftSignupUpdateSchema,
  US_STATES,
  uuid,
  volunteerOpportunitySchema,
  volunteerShiftSchema,
  type ListQuery,
  type ShiftSignupInput,
  type ShiftSignupUpdateInput,
  type VolunteerOpportunityInput,
  type VolunteerShiftInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { OpportunitiesService } from './opportunities.service';

// volunteerShiftSchema carries a superRefine (end after start) — unwrap to the
// base object for PATCH.
const shiftUpdateSchema = volunteerShiftSchema.innerType().partial();

const opportunitiesQuerySchema = listQuerySchema.extend({
  status: z.enum(OPPORTUNITY_STATUSES).optional(),
  state: z.enum(US_STATES).optional(),
  institutionId: uuid.optional(),
});
type OpportunitiesQuery = z.infer<typeof opportunitiesQuerySchema>;

const shiftsQuerySchema = listQuerySchema.extend({
  from: optionalDate,
  to: optionalDate,
  opportunityId: uuid.optional(),
});
type ShiftsQuery = z.infer<typeof shiftsQuerySchema>;

@Controller('volunteers/opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(
    @Query(zodQuery(opportunitiesQuerySchema)) query: OpportunitiesQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { status, state, institutionId, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.opportunities.list(listQuery as ListQuery, {
      status,
      institutionId,
      state: (user.chapter ?? state) as OpportunitiesQuery['state'],
    });
  }

  @Get(':id')
  @RequirePermission('volunteers.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.opportunities.get(id, user);
  }

  @Post()
  @RequirePermission('volunteers.create')
  create(
    @Body(zodBody(volunteerOpportunitySchema)) body: VolunteerOpportunityInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunities.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(volunteerOpportunitySchema.partial())) body: Partial<VolunteerOpportunityInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunities.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.opportunities.softDelete(id, user);
  }

  @Post(':id/shifts')
  @RequirePermission('volunteers.create')
  createShift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(volunteerShiftSchema)) body: VolunteerShiftInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunities.createShift(id, body, user);
  }
}

@Controller('volunteers/shifts')
export class ShiftsController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  /** Schedule view: shifts across opportunities within a date range. */
  @Get()
  @RequirePermission('volunteers.read')
  list(
    @Query(zodQuery(shiftsQuerySchema)) query: ShiftsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { from, to, opportunityId, ...listQuery } = query;
    return this.opportunities.listShifts(listQuery as ListQuery, { from, to, opportunityId }, user);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(shiftUpdateSchema)) body: Partial<VolunteerShiftInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunities.updateShift(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.opportunities.softDeleteShift(id, user);
  }

  // Coordinators manage rosters — signup creation sits under volunteers.update.
  @Post(':id/signups')
  @RequirePermission('volunteers.update')
  createSignup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(shiftSignupSchema)) body: ShiftSignupInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunities.createSignup(id, body, user);
  }
}

@Controller('volunteers/signups')
export class SignupsController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(shiftSignupUpdateSchema)) body: ShiftSignupUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunities.updateSignup(id, body, user);
  }

  @Post(':id/check-in')
  @RequirePermission('volunteers.update')
  checkIn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.opportunities.checkIn(id, user);
  }

  @Post(':id/check-out')
  @RequirePermission('volunteers.update')
  checkOut(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.opportunities.checkOut(id, user);
  }
}
