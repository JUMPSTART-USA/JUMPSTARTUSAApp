import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ATTENDANCE_STATUSES,
  batchEnrollSchema,
  CLASS_STATUSES,
  classCloseOutSchema,
  insideClassSchema,
  insideEnrollmentSchema,
  listQuerySchema,
  optionalDate,
  optionalTrimmed,
  requiredDate,
  CHAPTER_STATES,
  uuid,
  type BatchEnrollInput,
  type ClassCloseOutInput,
  type InsideClassInput,
  type InsideEnrollmentInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { InsideClassesService } from './inside-classes.service';

const listFiltersSchema = listQuerySchema.extend({
  institutionId: uuid.optional(),
  status: z.enum(CLASS_STATUSES).optional(),
  // The chapter filter (§7.2), not a postal address — this entity's state IS
  // its chapter. It accepted all 50 US_STATES, which was meaningless for the 44
  // that are not chapters and became a type error once USA joined the list.
  state: z.enum(CHAPTER_STATES).optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// Sessions/attendance are Phase 2 — no shared schema yet, so the endpoint
// contract lives here until one is promoted into @jumpstart/shared.
const insideSessionSchema = z.object({
  sessionDate: requiredDate,
  topic: optionalTrimmed,
  notes: optionalTrimmed,
});
type InsideSessionBody = z.infer<typeof insideSessionSchema>;

const attendanceSchema = z.object({
  rows: z
    .array(
      z.object({
        enrollmentId: uuid,
        status: z.enum(ATTENDANCE_STATUSES),
        notes: optionalTrimmed,
      }),
    )
    .min(1),
});
type AttendanceBody = z.infer<typeof attendanceSchema>;

// The shared schemas carry superRefine cross-field rules, so PATCH bodies
// validate against innerType().partial(); the service re-checks those rules
// against the merged record (§6.2).
const insideClassPatchSchema = insideClassSchema.innerType().partial();
const insideEnrollmentPatchSchema = insideEnrollmentSchema.innerType().partial();

@Controller('inside-classes')
export class InsideClassesController {
  constructor(private readonly insideClasses: InsideClassesService) {}

  @Get()
  @RequirePermission('inside_classes.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { institutionId, status, state, from, to, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.insideClasses.list(listQuery as ListQuery, {
      institutionId,
      status,
      state: (user.chapter ?? state) as ListFilters['state'],
      from,
      to,
    });
  }

  @Post()
  @RequirePermission('inside_classes.create')
  create(
    @Body(zodBody(insideClassSchema)) body: InsideClassInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.create(body, user);
  }

  // Static-prefix routes are declared before ':id' routes.

  @Post('enrollments')
  @RequirePermission('inside_classes.create')
  enroll(
    @Body(zodBody(insideEnrollmentSchema)) body: InsideEnrollmentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.enroll(body, user);
  }

  @Patch('enrollments/:enrollmentId')
  @RequirePermission('inside_classes.update')
  updateEnrollment(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body(zodBody(insideEnrollmentPatchSchema)) body: Partial<InsideEnrollmentInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.updateEnrollment(enrollmentId, body, user);
  }

  @Put('sessions/:sessionId/attendance')
  @RequirePermission('inside_classes.update')
  recordAttendance(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(zodBody(attendanceSchema)) body: AttendanceBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.recordAttendance(sessionId, body.rows, user);
  }

  @Get(':id')
  @RequirePermission('inside_classes.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.insideClasses.get(id, user);
  }

  @Patch(':id')
  @RequirePermission('inside_classes.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(insideClassPatchSchema)) body: Partial<InsideClassInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('inside_classes.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.insideClasses.softDelete(id, user);
  }

  @Post(':id/enrollments/batch')
  @RequirePermission('inside_classes.create')
  batchEnroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(batchEnrollSchema)) body: BatchEnrollInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.batchEnroll(id, body, user);
  }

  @Post(':id/close-out')
  @RequirePermission('inside_classes.update')
  closeOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(classCloseOutSchema)) body: ClassCloseOutInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.closeOut(id, body, user);
  }

  @Post(':id/sessions')
  @RequirePermission('inside_classes.create')
  createSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(insideSessionSchema)) body: InsideSessionBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.createSession(id, body, user);
  }

  @Get(':id/sessions')
  @RequirePermission('inside_classes.read')
  listSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.listSessions(id, user);
  }

  @Patch('sessions/:sessionId')
  @RequirePermission('inside_classes.update')
  updateSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(zodBody(insideSessionSchema.partial())) body: Partial<InsideSessionBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.updateSession(sessionId, body, user);
  }

  @Delete('sessions/:sessionId')
  @RequirePermission('inside_classes.delete')
  removeSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.deleteSession(sessionId, user);
  }
}
