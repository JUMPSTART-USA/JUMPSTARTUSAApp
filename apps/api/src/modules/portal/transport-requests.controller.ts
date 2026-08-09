import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CHAPTER_STATES,
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
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('transport-requests')
export class TransportRequestsController {
  constructor(private readonly transportRequests: TransportRequestsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { participantProfileId, status, from, to, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.transportRequests.list(listQuery as ListQuery, {
      participantProfileId,
      status,
      from,
      to,
      state: user.chapter ?? state,
    });
  }

  @Post(':id/decision')
  @RequirePermission('case_management.update')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(transportDecisionSchema)) body: TransportDecisionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transportRequests.decide(id, body, user);
  }
}
