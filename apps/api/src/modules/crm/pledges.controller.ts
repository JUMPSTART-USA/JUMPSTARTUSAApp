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
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { donorId, status, campaignId, fundId, ...listQuery } = query;
    return this.pledges.list(listQuery as ListQuery, { donorId, status, campaignId, fundId });
  }

  @Get(':id')
  @RequirePermission('donors.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.pledges.detail(id);
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(pledgeSchema)) body: PledgeInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pledges.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(pledgeUpdateSchema)) body: Partial<PledgeInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pledges.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pledges.softDelete(id, user.id);
  }

  @Post(':id/payments')
  @RequirePermission('donors.create')
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(schedulePaymentSchema)) body: SchedulePaymentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pledges.recordPayment(id, body, user.id);
  }
}
