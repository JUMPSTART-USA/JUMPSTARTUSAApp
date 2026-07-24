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
  optionalDate,
  outboundReferralSchema,
  uuid,
  type ListQuery,
  type OutboundReferralInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { ReferralsService } from './referrals.service';

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  vendorId: uuid.optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// outboundReferralSchema is a ZodEffects (vendor-or-provider rule); partial()
// lives on its inner object. Neither field is clearable via PATCH, so the
// vendor-or-provider invariant cannot be broken by a partial update.
const referralUpdateSchema = outboundReferralSchema.innerType().partial();

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { participantProfileId, vendorId, from, to, ...listQuery } = query;
    return this.referrals.list(listQuery as ListQuery, { participantProfileId, vendorId, from, to });
  }

  @Get(':id')
  @RequirePermission('case_management.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.referrals.get(id);
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(outboundReferralSchema)) body: OutboundReferralInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.referrals.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(referralUpdateSchema)) body: Partial<OutboundReferralInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.referrals.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.referrals.softDelete(id, user.id);
  }
}
