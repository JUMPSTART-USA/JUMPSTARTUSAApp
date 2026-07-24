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
  goalMilestoneSchema,
  goalSchema,
  listQuerySchema,
  servicePlanSchema,
  uuid,
  type ListQuery,
  type ServicePlanInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import {
  ServicePlansService,
  type GoalCreateInput,
  type MilestoneCreateInput,
} from './service-plans.service';

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// Parent ids come from the URL on nested routes.
const goalCreateSchema = goalSchema.omit({ servicePlanId: true });
const milestoneCreateSchema = goalMilestoneSchema.omit({ goalId: true });

@Controller('service-plans')
export class ServicePlansController {
  constructor(private readonly plans: ServicePlansService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { participantProfileId, status, ...listQuery } = query;
    return this.plans.list(listQuery as ListQuery, { participantProfileId, status });
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(servicePlanSchema)) body: ServicePlanInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.create(body, user.id);
  }

  // ── Goals & milestones (declared before ':id' so static prefixes win) ─────

  @Patch('goals/:goalId')
  @RequirePermission('case_management.update')
  updateGoal(
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body(zodBody(goalCreateSchema.partial())) body: Partial<GoalCreateInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.updateGoal(goalId, body, user.id);
  }

  @Post('goals/:goalId/milestones')
  @RequirePermission('case_management.create')
  createMilestone(
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body(zodBody(milestoneCreateSchema)) body: MilestoneCreateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.createMilestone(goalId, body, user.id);
  }

  @Patch('milestones/:milestoneId')
  @RequirePermission('case_management.update')
  updateMilestone(
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body(zodBody(milestoneCreateSchema.partial())) body: Partial<MilestoneCreateInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.updateMilestone(milestoneId, body, user.id);
  }

  @Post('milestones/:milestoneId/complete')
  @RequirePermission('case_management.update')
  completeMilestone(
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.completeMilestone(milestoneId, user.id);
  }

  @Post('milestones/:milestoneId/uncomplete')
  @RequirePermission('case_management.update')
  uncompleteMilestone(
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.uncompleteMilestone(milestoneId, user.id);
  }

  @Delete('milestones/:milestoneId')
  @RequirePermission('case_management.delete')
  deleteMilestone(
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.deleteMilestone(milestoneId, user.id);
  }

  // ── Plan by id ────────────────────────────────────────────────────────────

  @Get(':id')
  @RequirePermission('case_management.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.get(id);
  }

  @Post(':id/goals')
  @RequirePermission('case_management.create')
  createGoal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(goalCreateSchema)) body: GoalCreateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.createGoal(id, body, user.id);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(servicePlanSchema.partial())) body: Partial<ServicePlanInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.plans.softDelete(id, user.id);
  }
}
