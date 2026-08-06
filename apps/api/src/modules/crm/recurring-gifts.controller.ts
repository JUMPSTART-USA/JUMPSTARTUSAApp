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
  RECURRING_GIFT_STATUSES,
  recurringGiftSchema,
  schedulePaymentSchema,
  uuid,
  type ListQuery,
  type RecurringGiftInput,
  type SchedulePaymentInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { RecurringGiftsService } from './recurring-gifts.service';

const listFiltersSchema = listQuerySchema.extend({
  donorId: uuid.optional(),
  status: z.enum(RECURRING_GIFT_STATUSES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// recurringGiftSchema is a ZodEffects (cross-field date refinement) —
// partial() lives on the inner object; merged-record rules run in the service.
const recurringGiftUpdateSchema = recurringGiftSchema.innerType().partial();

@Controller('recurring-gifts')
export class RecurringGiftsController {
  constructor(private readonly recurringGifts: RecurringGiftsService) {}

  @Get()
  @RequirePermission('donors.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { donorId, status, ...listQuery } = query;
    return this.recurringGifts.list(listQuery as ListQuery, { donorId, status });
  }

  @Get(':id')
  @RequirePermission('donors.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.recurringGifts.detail(id);
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(recurringGiftSchema)) body: RecurringGiftInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recurringGifts.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(recurringGiftUpdateSchema)) body: Partial<RecurringGiftInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recurringGifts.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recurringGifts.softDelete(id, user.id);
  }

  @Post(':id/payments')
  @RequirePermission('donors.create')
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(schedulePaymentSchema)) body: SchedulePaymentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recurringGifts.recordPayment(id, body, user.id);
  }
}
