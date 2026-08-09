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
  listQuerySchema,
  PLEDGE_STATUSES,
  pledgeSchema,
  schedulePaymentSchema,
  uuid,
  type ListQuery,
  type PledgeInput,
  type SchedulePaymentInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PledgesService } from './pledges.service';

const listFiltersSchema = listQuerySchema.extend({
  state: z.enum(CHAPTER_STATES).optional(),
  donorId: uuid.optional(),
  status: z.enum(PLEDGE_STATUSES).optional(),
  campaignId: uuid.optional(),
  fundId: uuid.optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// pledgeSchema is wrapped by two cross-field superRefines (ZodEffects has no
// .partial()), so unwrap to the base object for PATCH. The merged-record
// rules those refinements cover are enforced in the service.
const pledgeUpdateSchema = pledgeSchema.innerType().innerType().partial();

@Controller('pledges')
export class PledgesController {
  constructor(private readonly pledges: PledgesService) {}

  @Get()
  @RequirePermission('donors.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { state, donorId, status, campaignId, fundId, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.pledges.list(listQuery as ListQuery, {
      state: user.chapter ?? state,
      donorId,
      status,
      campaignId,
      fundId,
    });
  }

  @Get(':id')
  @RequirePermission('donors.read')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pledges.detail(id, user);
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(pledgeSchema)) body: PledgeInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pledges.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(pledgeUpdateSchema)) body: Partial<PledgeInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pledges.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pledges.softDelete(id, user);
  }

  @Post(':id/payments')
  @RequirePermission('donors.create')
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(schedulePaymentSchema)) body: SchedulePaymentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pledges.recordPayment(id, body, user);
  }
}
