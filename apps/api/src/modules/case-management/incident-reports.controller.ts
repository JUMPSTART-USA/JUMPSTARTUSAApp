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
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('incident-reports')
export class IncidentReportsController {
  constructor(private readonly incidents: IncidentReportsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { participantProfileId, status, severity, category, from, to, ...listQuery } = query;
    return this.incidents.list(listQuery as ListQuery, {
      participantProfileId,
      status,
      severity,
      category,
      from,
      to,
    });
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(incidentReportSchema)) body: IncidentReportInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidents.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(incidentReportUpdateSchema)) body: IncidentReportUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidents.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.incidents.softDelete(id, user.id);
  }
}
