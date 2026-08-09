import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  CHAPTER_STATES,
  CHECKIN_WAVES,
  listQuerySchema,
  outcomeCheckinCompleteSchema,
  outcomeCheckinScheduleSchema,
  uuid,
  type ListQuery,
  type OutcomeCheckinCompleteInput,
  type OutcomeCheckinScheduleInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { OutcomeCheckinsService } from './outcome-checkins.service';

const listFiltersSchema = listQuerySchema.extend({
  due: z.enum(['overdue', 'upcoming']).optional(),
  wave: z.enum(CHECKIN_WAVES).optional(),
  participantProfileId: uuid.optional(),
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('outcome-checkins')
export class OutcomeCheckinsController {
  constructor(private readonly checkins: OutcomeCheckinsService) {}

  @Get()
  @RequirePermission('alumni.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { due, wave, participantProfileId, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.checkins.list(listQuery as ListQuery, {
      due,
      wave,
      participantProfileId,
      state: user.chapter ?? state,
    });
  }

  @Get(':id')
  @RequirePermission('alumni.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.checkins.get(id, user);
  }

  @Post()
  @RequirePermission('alumni.create')
  schedule(
    @Body(zodBody(outcomeCheckinScheduleSchema)) body: OutcomeCheckinScheduleInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkins.schedule(body, user);
  }

  @Put(':id/complete')
  @RequirePermission('alumni.update')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(outcomeCheckinCompleteSchema)) body: OutcomeCheckinCompleteInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkins.complete(id, body, user);
  }
}
