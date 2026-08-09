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
  DONOR_TASK_STATUSES,
  donorTaskSchema,
  INTERACTION_CHANNELS,
  INTERACTION_PURPOSES,
  listQuerySchema,
  uuid,
  type DonorTaskInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { DonorTasksService, type DonorTaskUpdate } from './donor-tasks.service';

const listFiltersSchema = listQuerySchema.extend({
  donorId: uuid.optional(),
  // 'me' resolves to the calling user — the SPA's "My tasks" tab.
  assignedToId: z.union([z.literal('me'), uuid]).optional(),
  status: z.enum(DONOR_TASK_STATUSES).optional(),
  state: z.enum(CHAPTER_STATES).optional(),
  overdue: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const taskUpdateSchema = donorTaskSchema.partial().extend({
  logInteraction: z
    .object({
      channel: z.enum(INTERACTION_CHANNELS),
      purpose: z.enum(INTERACTION_PURPOSES),
    })
    .optional(),
});

@Controller('donor-tasks')
export class DonorTasksController {
  constructor(private readonly tasks: DonorTasksService) {}

  @Get()
  @RequirePermission('donors.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { donorId, assignedToId, status, state, overdue, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.tasks.list(listQuery as ListQuery, {
      donorId,
      assignedToId: assignedToId === 'me' ? user.id : assignedToId,
      status,
      state: (user.chapter ?? state) as ListFilters['state'],
      overdue,
    });
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(donorTaskSchema)) body: DonorTaskInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(taskUpdateSchema)) body: DonorTaskUpdate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.remove(id, user);
  }
}
