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
  MENTOR_ASSIGNMENT_STATUSES,
  mentorAssignmentEndSchema,
  mentorAssignmentPauseSchema,
  mentorAssignmentSchema,
  mentorSessionLogSchema,
  uuid,
  type ListQuery,
  type MentorAssignmentEndInput,
  type MentorAssignmentInput,
  type MentorAssignmentPauseInput,
  type MentorSessionLogInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { MentorAssignmentsService } from './assignments.service';

const listFiltersSchema = listQuerySchema.extend({
  status: z.enum(MENTOR_ASSIGNMENT_STATUSES).optional(),
  mentorProfileId: uuid.optional(),
  participantProfileId: uuid.optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const sessionListFiltersSchema = listQuerySchema.extend({
  mentorAssignmentId: uuid.optional(),
});
type SessionListFilters = z.infer<typeof sessionListFiltersSchema>;

// The parties never change, and status moves only through the dedicated
// activate/pause/end workflow endpoints (§6.7 workflow 4).
const updateSchema = mentorAssignmentSchema
  .omit({ mentorProfileId: true, participantProfileId: true, status: true })
  .partial();
type UpdateInput = z.infer<typeof updateSchema>;

@Controller('mentoring')
export class MentorAssignmentsController {
  constructor(private readonly assignments: MentorAssignmentsService) {}

  @Post('assignments')
  @RequirePermission('mentoring.create')
  create(
    @Body(zodBody(mentorAssignmentSchema)) body: MentorAssignmentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.create(body, user.id);
  }

  @Get('assignments')
  @RequirePermission('mentoring.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { status, mentorProfileId, participantProfileId, ...listQuery } = query;
    return this.assignments.list(listQuery as ListQuery, {
      status,
      mentorProfileId,
      participantProfileId,
    });
  }

  @Get('assignments/:id')
  @RequirePermission('mentoring.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.get(id);
  }

  @Patch('assignments/:id')
  @RequirePermission('mentoring.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateSchema)) body: UpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.update(id, body, user.id);
  }

  // mentoring.read, not update: case managers approve matches but hold only
  // read on this module — the real authorization (assigned case manager OR
  // case_management.update, §6.7) is enforced in the service.
  @Post('assignments/:id/activate')
  @RequirePermission('mentoring.read')
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assignments.activate(id, user);
  }

  @Post('assignments/:id/pause')
  @RequirePermission('mentoring.update')
  pause(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(mentorAssignmentPauseSchema)) body: MentorAssignmentPauseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.pause(id, body, user.id);
  }

  @Post('assignments/:id/end')
  @RequirePermission('mentoring.update')
  end(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(mentorAssignmentEndSchema)) body: MentorAssignmentEndInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.end(id, body, user.id);
  }

  @Post('session-logs')
  @RequirePermission('mentoring.create')
  logSession(
    @Body(zodBody(mentorSessionLogSchema)) body: MentorSessionLogInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.logSession(body, user.id);
  }

  @Get('session-logs')
  @RequirePermission('mentoring.read')
  listSessions(@Query(zodQuery(sessionListFiltersSchema)) query: SessionListFilters) {
    const { mentorAssignmentId, ...listQuery } = query;
    return this.assignments.listSessions(listQuery as ListQuery, { mentorAssignmentId });
  }

  @Get('oversight')
  @RequirePermission('mentoring.read')
  oversight() {
    return this.assignments.oversight();
  }
}
