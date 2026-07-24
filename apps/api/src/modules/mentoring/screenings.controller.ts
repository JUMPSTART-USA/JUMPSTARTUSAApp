import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  listQuerySchema,
  MENTOR_SCREENING_STAGES,
  mentorScreeningCriterionUpdateSchema,
  mentorScreeningSchema,
  mentorScreeningStepSchema,
  type ListQuery,
  type MentorScreeningCriterionUpdateInput,
  type MentorScreeningInput,
  type MentorScreeningStepInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { MentorScreeningsService } from './screenings.service';

const listFiltersSchema = listQuerySchema.extend({
  stage: z.enum(MENTOR_SCREENING_STAGES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// A screening never moves to a different volunteer.
const updateSchema = mentorScreeningSchema.omit({ volunteerProfileId: true }).partial();
type UpdateInput = z.infer<typeof updateSchema>;

@Controller('mentoring')
export class MentorScreeningsController {
  constructor(private readonly screenings: MentorScreeningsService) {}

  @Post('screenings')
  @RequirePermission('mentoring.create')
  create(
    @Body(zodBody(mentorScreeningSchema)) body: MentorScreeningInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screenings.create(body, user.id);
  }

  @Get('screenings')
  @RequirePermission('mentoring.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { stage, ...listQuery } = query;
    return this.screenings.list(listQuery as ListQuery, { stage });
  }

  @Get('screenings/:id')
  @RequirePermission('mentoring.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.screenings.get(id);
  }

  @Patch('screenings/:id')
  @RequirePermission('mentoring.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateSchema)) body: UpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screenings.update(id, body, user.id);
  }

  @Post('screenings/:id/steps')
  @RequirePermission('mentoring.update')
  addStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(mentorScreeningStepSchema)) body: MentorScreeningStepInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screenings.addStep(id, body, user.id);
  }

  @Patch('criteria/:id')
  @RequirePermission('mentoring.update')
  updateCriterion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(mentorScreeningCriterionUpdateSchema)) body: MentorScreeningCriterionUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screenings.updateCriterion(id, body, user.id);
  }
}
