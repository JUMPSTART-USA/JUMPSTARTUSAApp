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
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  incidentReportSchema,
  listQuerySchema,
  optionalDate,
  uuid,
  type IncidentReportInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import {
  IncidentReportsService,
  type IncidentReportUpdateInput,
} from './incident-reports.service';

// incidentReportSchema is ZodEffects (not-in-the-future refinement), so the
// PATCH partial comes from innerType() — with the refinement re-applied so it
// still runs on provided incidentDates.
const notFutureIncidentDate = (val: { incidentDate?: Date }, ctx: z.RefinementCtx) => {
  if (val.incidentDate && val.incidentDate > new Date()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Incident date cannot be in the future',
      path: ['incidentDate'],
    });
  }
};
const incidentReportUpdateSchema = incidentReportSchema
  .innerType()
  .partial()
  .superRefine(notFutureIncidentDate);

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  status: z.enum(INCIDENT_STATUSES).optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  category: z.enum(INCIDENT_CATEGORIES).optional(),
  from: optionalDate,
  to: optionalDate,
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('incident-reports')
export class IncidentReportsController {
  constructor(private readonly incidents: IncidentReportsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { participantProfileId, status, severity, category, from, to, state, ...listQuery } =
      query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.incidents.list(listQuery as ListQuery, {
      participantProfileId,
      status,
      severity,
      category,
      from,
      to,
      state: user.chapter ?? state,
    });
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(incidentReportSchema)) body: IncidentReportInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidents.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(incidentReportUpdateSchema)) body: IncidentReportUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidents.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.incidents.softDelete(id, user);
  }
}
