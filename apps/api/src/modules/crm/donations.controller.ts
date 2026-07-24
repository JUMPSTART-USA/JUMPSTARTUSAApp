import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  donationSchema,
  listQuerySchema,
  optionalDate,
  type DonationInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { DonationsService } from './donations.service';

const listFiltersSchema = listQuerySchema.extend({
  donorId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  fund: z.string().trim().max(200).optional(),
  isRecurring: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const summaryFiltersSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  campaignId: z.string().uuid().optional(),
  donorId: z.string().uuid().optional(),
});
type SummaryFilters = z.infer<typeof summaryFiltersSchema>;

@Controller('donations')
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  // Static route declared before any parameterized siblings.
  @Get('summary')
  @RequirePermission('donors.read')
  summary(@Query(zodQuery(summaryFiltersSchema)) query: SummaryFilters) {
    return this.donations.summary(query);
  }

  @Get()
  @RequirePermission('donors.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { donorId, campaignId, eventId, fund, isRecurring, from, to, ...listQuery } = query;
    return this.donations.list(listQuery as ListQuery, {
      donorId,
      campaignId,
      eventId,
      fund,
      isRecurring,
      from,
      to,
    });
  }

  // Manual entry path (historical import fixes) — admin-only in practice.
  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(donationSchema)) body: DonationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donations.create(body, user.id);
  }
}
