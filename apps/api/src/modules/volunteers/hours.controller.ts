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

const hoursQuerySchema = listQuerySchema.extend({
  volunteerProfileId: uuid.optional(),
  status: z.enum(HOURS_STATUSES).optional(),
  opportunityId: uuid.optional(),
  institutionId: uuid.optional(),
  from: optionalDate,
  to: optionalDate,
});
type HoursQuery = z.infer<typeof hoursQuerySchema>;

@Controller('volunteers/hours')
export class HoursController {
  constructor(private readonly hours: HoursService) {}

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
