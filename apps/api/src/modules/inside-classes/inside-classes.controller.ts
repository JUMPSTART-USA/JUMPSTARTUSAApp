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
  batchEnrollSchema,
  CLASS_STATUSES,
  classCloseOutSchema,
  insideClassSchema,
  insideEnrollmentSchema,
  listQuerySchema,
  optionalDate,
  optionalTrimmed,
  requiredDate,
  US_STATES,
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
  state: z.enum(US_STATES).optional(),
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
        status: z.enum(['present', 'absent', 'excused']),
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
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { institutionId, status, state, from, to, ...listQuery } = query;
    return this.insideClasses.list(listQuery as ListQuery, {
      institutionId,
      status,
      state,
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
    return this.insideClasses.create(body, user.id);
  }

  // Static-prefix routes are declared before ':id' routes.

  @Post('enrollments')
  @RequirePermission('inside_classes.create')
  enroll(
    @Body(zodBody(insideEnrollmentSchema)) body: InsideEnrollmentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.enroll(body, user.id);
  }

  @Patch('enrollments/:enrollmentId')
  @RequirePermission('inside_classes.update')
  updateEnrollment(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body(zodBody(insideEnrollmentPatchSchema)) body: Partial<InsideEnrollmentInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.updateEnrollment(enrollmentId, body, user.id);
  }

  @Put('sessions/:sessionId/attendance')
  @RequirePermission('inside_classes.update')
  recordAttendance(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(zodBody(attendanceSchema)) body: AttendanceBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.recordAttendance(sessionId, body.rows, user.id);
  }

  @Get(':id')
  @RequirePermission('inside_classes.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.insideClasses.get(id);
  }

  @Patch(':id')
  @RequirePermission('inside_classes.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(insideClassPatchSchema)) body: Partial<InsideClassInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('inside_classes.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.insideClasses.softDelete(id, user.id);
  }

  @Post(':id/enrollments/batch')
  @RequirePermission('inside_classes.create')
  batchEnroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(batchEnrollSchema)) body: BatchEnrollInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.batchEnroll(id, body, user.id);
  }

  @Post(':id/close-out')
  @RequirePermission('inside_classes.update')
  closeOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(classCloseOutSchema)) body: ClassCloseOutInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.closeOut(id, body, user.id);
  }

  @Post(':id/sessions')
  @RequirePermission('inside_classes.create')
  createSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(insideSessionSchema)) body: InsideSessionBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.insideClasses.createSession(id, body, user.id);
  }

  @Get(':id/sessions')
  @RequirePermission('inside_classes.read')
  listSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.insideClasses.listSessions(id);
  }
}
