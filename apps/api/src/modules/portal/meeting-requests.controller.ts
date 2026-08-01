import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  MEETING_REQUEST_STATUSES,
  listQuerySchema,
  meetingDecisionSchema,
  uuid,
  type ListQuery,
  type MeetingDecisionInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { MeetingRequestsService } from './meeting-requests.service';

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  status: z.enum(MEETING_REQUEST_STATUSES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('meeting-requests')
export class MeetingRequestsController {
  constructor(private readonly meetingRequests: MeetingRequestsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { participantProfileId, status, ...listQuery } = query;
    return this.meetingRequests.list(listQuery as ListQuery, { participantProfileId, status });
  }

  @Post(':id/decision')
  @RequirePermission('case_management.update')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(meetingDecisionSchema)) body: MeetingDecisionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.meetingRequests.decide(id, body, user.id);
  }
}
