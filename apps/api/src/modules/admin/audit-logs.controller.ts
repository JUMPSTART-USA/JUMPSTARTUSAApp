import { Controller, Get, Query } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  listQuerySchema,
  optionalDate,
  uuid,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { RequirePermission } from '../../common/decorators';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';
import { AdminAuditLogsService } from './audit-logs.service';

const listFiltersSchema = listQuerySchema.extend({
  userId: uuid.optional(),
  entityType: z.string().trim().max(100).optional(),
  entityId: z.string().trim().max(100).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AdminAuditLogsService) {}

  @Get()
  @RequirePermission('audit.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { userId, entityType, entityId, action, from, to, ...listQuery } = query;
    return this.auditLogs.list(listQuery as ListQuery, {
      userId,
      entityType,
      entityId,
      action,
      from,
      to,
    });
  }
}
