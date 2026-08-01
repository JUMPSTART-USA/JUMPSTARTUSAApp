import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ASSIGNMENT_TYPES,
  endNotBeforeStart,
  optionalDate,
  PROGRAM_TYPES,
  US_STATES,
  uuid,
} from '@jumpstart/shared';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { exportFilterEcho, reportToCsv, reportToPdf, reportToWorkbook } from './report-export.util';
import { ReportsService } from './reports.service';

// One superset schema for every report's params — each report reads its own
// subset; report-specific status vocabularies are validated in the service.
const baseParamsSchema = z.object({
  state: z.enum(US_STATES).optional(),
  status: z.string().trim().max(40).optional(),
  insideClassId: uuid.optional(),
  institutionId: uuid.optional(),
  from: optionalDate,
  to: optionalDate,
  programType: z.enum(PROGRAM_TYPES).optional(),
  caseManagerId: uuid.optional(),
  assignmentType: z.enum(ASSIGNMENT_TYPES).optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(730).optional(),
  campaignId: uuid.optional(),
  participantProfileId: uuid.optional(),
  employerId: uuid.optional(),
  vehicleId: uuid.optional(),
});
const reportParamsSchema = baseParamsSchema.superRefine(endNotBeforeStart('from', 'to'));
type ReportQuery = z.infer<typeof reportParamsSchema>;

const exportQuerySchema = baseParamsSchema
  .extend({ format: z.enum(['csv', 'xlsx', 'pdf']).default('csv') })
  .superRefine(endNotBeforeStart('from', 'to'));
type ExportQuery = z.infer<typeof exportQuerySchema>;

/** Chapter scoping (§7.2): scoped users always run reports over their own chapter. */
const scopeToChapter = (params: ReportQuery, user: AuthenticatedUser): ReportQuery =>
  user.chapter ? { ...params, state: user.chapter as ReportQuery['state'] } : params;

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('reports.read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.listAvailable(user);
  }

  @Get(':key')
  @RequirePermission('reports.read')
  run(
    @Param('key') key: string,
    @Query(zodQuery(reportParamsSchema)) params: ReportQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.run(key, scopeToChapter(params, user), user);
  }

  @Get(':key/export')
  @RequirePermission('reports.export')
  async export(
    @Param('key') key: string,
    @Query(zodQuery(exportQuerySchema)) query: ExportQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { format, ...rawParams } = query;
    const params = scopeToChapter(rawParams, user);
    const result = await this.reports.run(key, params, user);

    // §9.1: every export writes an audit row (who, which report, which
    // filters) BEFORE bytes leave the server — an aborted download is still
    // an export. The echo reflects the chapter-scoped filters actually applied.
    const filters = exportFilterEcho(params);
    await this.audit.logExport(user.id, 'report', { report: key, format, filters });

    const filename = `${key}-${new Date().toISOString().slice(0, 10)}.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(reportToCsv(result));
      return;
    }
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.send(await reportToPdf(result, this.reports.reportName(key), filters));
      return;
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    await reportToWorkbook(result, key).xlsx.write(res);
    res.end();
  }
}
