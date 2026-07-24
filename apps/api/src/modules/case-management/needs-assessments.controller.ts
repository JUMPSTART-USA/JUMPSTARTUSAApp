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
  listQuerySchema,
  needsAssessmentSchema,
  optionalDate,
  uuid,
  type ListQuery,
  type NeedsAssessmentInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { NeedsAssessmentsService } from './needs-assessments.service';

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('needs-assessments')
export class NeedsAssessmentsController {
  constructor(private readonly assessments: NeedsAssessmentsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { participantProfileId, from, to, ...listQuery } = query;
    return this.assessments.list(listQuery as ListQuery, { participantProfileId, from, to });
  }

  @Get(':id')
  @RequirePermission('case_management.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.get(id);
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(needsAssessmentSchema)) body: NeedsAssessmentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessments.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(needsAssessmentSchema.partial())) body: Partial<NeedsAssessmentInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessments.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assessments.softDelete(id, user.id);
  }
}
