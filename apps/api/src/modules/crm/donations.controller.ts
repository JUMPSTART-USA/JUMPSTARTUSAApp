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
  acknowledgeDonationSchema,
  donationSchema,
  listQuerySchema,
  optionalDate,
  softCreditSchema,
  uuid,
  type AcknowledgeDonationInput,
  type DonationInput,
  type ListQuery,
  type SoftCreditInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { DonationsService } from './donations.service';

const boolParam = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const filterShape = {
  donorId: uuid.optional(),
  campaignId: uuid.optional(),
  eventId: uuid.optional(),
  fundId: uuid.optional(),
  appealId: uuid.optional(),
  pledgeId: uuid.optional(),
  recurringGiftId: uuid.optional(),
  isRecurring: boolParam,
  acknowledged: boolParam,
  from: optionalDate,
  to: optionalDate,
};

const listFiltersSchema = listQuerySchema.extend(filterShape);
type ListFilters = z.infer<typeof listFiltersSchema>;

const summaryFiltersSchema = z.object({
  ...filterShape,
  search: z.string().trim().max(200).optional(),
});
type SummaryFilters = z.infer<typeof summaryFiltersSchema>;

// donationSchema is a ZodEffects (tribute + non-deductible refinements) —
// partial() lives on the inner object; merged-record rules run in the service.
const donationUpdateSchema = donationSchema.innerType().partial();

@Controller('donations')
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  // Static route declared before any parameterized siblings.
  @Get('summary')
  @RequirePermission('donors.read')
  summary(@Query(zodQuery(summaryFiltersSchema)) query: SummaryFilters) {
    const { search, ...filters } = query;
    return this.donations.summary(filters, search);
  }

  @Get()
  @RequirePermission('donors.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const {
      donorId,
      campaignId,
      eventId,
      fundId,
      appealId,
      pledgeId,
      recurringGiftId,
      isRecurring,
      acknowledged,
      from,
      to,
      ...listQuery
    } = query;
    return this.donations.list(listQuery as ListQuery, {
      donorId,
      campaignId,
      eventId,
      fundId,
      appealId,
      pledgeId,
      recurringGiftId,
      isRecurring,
      acknowledged,
      from,
      to,
    });
  }

  @Get(':id')
  @RequirePermission('donors.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.donations.get(id);
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(donationSchema)) body: DonationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donations.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(donationUpdateSchema)) body: Partial<DonationInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donations.update(id, body, user.id);
  }

  @Delete('soft-credits/:id')
  @RequirePermission('donors.update')
  removeSoftCredit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donations.removeSoftCredit(id, user.id);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.donations.softDelete(id, user.id);
  }

  @Post(':id/acknowledge')
  @RequirePermission('donors.update')
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(acknowledgeDonationSchema)) body: AcknowledgeDonationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donations.acknowledge(id, body, user.id);
  }

  @Post(':id/soft-credits')
  @RequirePermission('donors.update')
  addSoftCredit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(softCreditSchema)) body: SoftCreditInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donations.addSoftCredit(id, body, user.id);
  }
}
