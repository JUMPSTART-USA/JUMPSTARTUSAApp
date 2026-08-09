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
  TRAVEL_REQUEST_STATUSES,
  endNotBeforeStart,
  listQuerySchema,
  optionalDate,
  travelDecisionSchema,
  travelRequestSchema,
  uuid,
  type ListQuery,
  type TravelDecisionInput,
  type TravelRequestInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import {
  TravelRequestsService,
  type TravelRequestUpdateInput,
} from './travel-requests.service';

// travelRequestSchema is ZodEffects (end>=start refinement), so the PATCH
// shape comes from innerType(). Edits may touch trip fields only — never
// participantProfileId or status — and the refinement is re-applied so it
// still runs when both dates are provided (single-date edits are re-checked
// against stored values in the service).
const travelRequestUpdateSchema = travelRequestSchema
  .innerType()
  .pick({ startDate: true, endDate: true, destination: true, purpose: true })
  .partial()
  .superRefine(endNotBeforeStart('startDate', 'endDate'));

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  status: z.enum(TRAVEL_REQUEST_STATUSES).optional(),
  from: optionalDate,
  to: optionalDate,
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('travel-requests')
export class TravelRequestsController {
  constructor(private readonly travelRequests: TravelRequestsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { participantProfileId, status, from, to, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.travelRequests.list(listQuery as ListQuery, {
      participantProfileId,
      status,
      from,
      to,
      state: user.chapter ?? state,
    });
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(travelRequestSchema)) body: TravelRequestInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.travelRequests.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(travelRequestUpdateSchema)) body: TravelRequestUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.travelRequests.update(id, body, user);
  }

  @Post(':id/decision')
  @RequirePermission('case_management.update')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(travelDecisionSchema)) body: TravelDecisionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.travelRequests.decide(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.travelRequests.softDelete(id, user);
  }
}
