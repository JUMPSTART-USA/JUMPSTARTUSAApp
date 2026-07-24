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
  caseTaskSchema,
  listQuerySchema,
  optionalDate,
  TASK_STATUSES,
  uuid,
  type CaseTaskInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { CaseTasksService } from './case-tasks.service';

const listFiltersSchema = listQuerySchema.extend({
  assignedToId: uuid.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  participantProfileId: uuid.optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('case-tasks')
export class CaseTasksController {
  constructor(private readonly tasks: CaseTasksService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { assignedToId, status, participantProfileId, from, to, ...listQuery } = query;
    return this.tasks.list(listQuery as ListQuery, {
      assignedToId,
      status,
      participantProfileId,
      from,
      to,
    });
  }

  @Get(':id')
  @RequirePermission('case_management.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(id);
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(caseTaskSchema)) body: CaseTaskInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.create(body, user.id);
  }

  @Post(':id/complete')
  @RequirePermission('case_management.update')
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.complete(id, user.id);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(caseTaskSchema.partial())) body: Partial<CaseTaskInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.softDelete(id, user.id);
  }
}
