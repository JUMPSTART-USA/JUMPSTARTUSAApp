import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  TRANSPORT_REQUEST_STATUSES,
  listQuerySchema,
  optionalDate,
  transportDecisionSchema,
  uuid,
  type ListQuery,
  type TransportDecisionInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { TransportRequestsService } from './transport-requests.service';

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  status: z.enum(TRANSPORT_REQUEST_STATUSES).optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('transport-requests')
export class TransportRequestsController {
  constructor(private readonly transportRequests: TransportRequestsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { participantProfileId, status, from, to, ...listQuery } = query;
    return this.transportRequests.list(listQuery as ListQuery, {
      participantProfileId,
      status,
      from,
      to,
    });
  }

  @Post(':id/decision')
  @RequirePermission('case_management.update')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(transportDecisionSchema)) body: TransportDecisionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transportRequests.decide(id, body, user.id);
  }
}
