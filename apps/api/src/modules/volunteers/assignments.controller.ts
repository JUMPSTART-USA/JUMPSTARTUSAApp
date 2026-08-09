import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { volunteerAssignmentSchema, type VolunteerAssignmentInput } from '@jumpstart/shared';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { AssignmentsService } from './assignments.service';

// The shared schema is double-wrapped in superRefines (cross-field rules that
// don't apply to partial updates) — unwrap to the base object for PATCH.
const assignmentUpdateSchema = volunteerAssignmentSchema.innerType().innerType().partial();

@Controller('volunteers/assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  @RequirePermission('volunteers.create')
  create(
    @Body(zodBody(volunteerAssignmentSchema)) body: VolunteerAssignmentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(assignmentUpdateSchema)) body: Partial<VolunteerAssignmentInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assignments.softDelete(id, user);
  }
}
