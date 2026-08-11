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
  HOURS_STATUSES,
  listQuerySchema,
  optionalDate,
  uuid,
  volunteerHoursSchema,
  type ListQuery,
  type VolunteerHoursInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { HoursService } from './hours.service';

/**
 * Hoisted so the list and the summary cannot drift apart on which filters they
 * accept — a total is only trustworthy if it answers for exactly the rows the
 * list would return. donations.controller.ts is shaped the same way.
 */
const hoursFilterShape = {
  volunteerProfileId: uuid.optional(),
  status: z.enum(HOURS_STATUSES).optional(),
  opportunityId: uuid.optional(),
  institutionId: uuid.optional(),
  from: optionalDate,
  to: optionalDate,
};

const hoursQuerySchema = listQuerySchema.extend(hoursFilterShape);
type HoursQuery = z.infer<typeof hoursQuerySchema>;

/** The same filters minus paging and sorting — an aggregate has no page. */
const hoursSummaryQuerySchema = z.object({
  ...hoursFilterShape,
  search: z.string().trim().max(200).optional(),
});
type HoursSummaryQuery = z.infer<typeof hoursSummaryQuerySchema>;

@Controller('volunteers/hours')
export class HoursController {
  constructor(private readonly hours: HoursService) {}

  /**
   * Declared before any parameterized sibling. Nothing shadows it today — this
   * controller has no GET-by-id route — but adding one later would send
   * /volunteers/hours/summary through ParseUUIDPipe and answer 400.
   */
  @Get('summary')
  @RequirePermission('volunteers.read')
  summary(
    @Query(zodQuery(hoursSummaryQuerySchema)) query: HoursSummaryQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { search, ...filters } = query;
    // Chapter scoping (§7.2) is derived in the service from user.chapter, by the
    // same buildWhere the list uses. Deliberately NO `state` param: this module
    // has never accepted one, and honouring a client-supplied chapter here would
    // be a scoped-user bypass.
    return this.hours.summary(filters, user, search);
  }

  @Get()
  @RequirePermission('volunteers.read')
  list(
    @Query(zodQuery(hoursQuerySchema)) query: HoursQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { volunteerProfileId, status, opportunityId, institutionId, from, to, ...listQuery } =
      query;
    return this.hours.list(
      listQuery as ListQuery,
      {
        volunteerProfileId,
        status,
        opportunityId,
        institutionId,
        from,
        to,
      },
      user,
    );
  }

  @Post()
  @RequirePermission('volunteers.create')
  create(
    @Body(zodBody(volunteerHoursSchema)) body: VolunteerHoursInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hours.create(body, user);
  }

  // Approve/reject rides on PATCH: body {status: approved|rejected} stamps the
  // reviewer (approvedById/approvedAt).
  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(volunteerHoursSchema.partial())) body: Partial<VolunteerHoursInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hours.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hours.softDelete(id, user);
  }
}
