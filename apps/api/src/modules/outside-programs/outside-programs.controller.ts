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
  ATTENDANCE_STATUSES,
  optionalTrimmed,
  outsideEnrollmentSchema,
  outsideProgramSchema,
  PROGRAM_TYPES,
  requiredDate,
  US_STATES,
  uuid,
  type ListQuery,
  type OutsideEnrollmentInput,
  type OutsideProgramInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import {
  OutsideProgramsService,
  type AttendanceRowInput,
  type OutsideEnrollmentUpdate,
  type OutsideProgramUpdate,
  type OutsideSessionInput,
} from './outside-programs.service';

const listFiltersSchema = listQuerySchema.extend({
  programType: z.enum(PROGRAM_TYPES).optional(),
  status: z.enum(['active', 'inactive', 'completed']).optional(),
  state: z.enum(US_STATES).optional(),
  staffLeadId: uuid.optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// PATCH payloads: the shared schemas are ZodEffects (cross-field refinements),
// so partials come from innerType(); the service re-validates the merged state.
const programUpdateSchema = outsideProgramSchema.innerType().partial();
const enrollmentUpdateSchema = outsideEnrollmentSchema
  .innerType()
  .omit({ participantProfileId: true, outsideProgramId: true })
  .partial();

// Sessions/attendance have no shared schema yet — local schemas composed from
// the shared primitives, same shape as the inside-class session model.
const sessionSchema = z.object({
  sessionDate: requiredDate,
  topic: optionalTrimmed,
  notes: optionalTrimmed,
});
const sessionUpdateSchema = sessionSchema.partial();

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
type AttendanceBody = { rows: AttendanceRowInput[] };

@Controller('outside-programs')
export class OutsideProgramsController {
  constructor(private readonly programs: OutsideProgramsService) {}

  @Get()
  @RequirePermission('outside_programs.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { programType, status, state, staffLeadId, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.programs.list(listQuery as ListQuery, {
      programType,
      status,
      state: (user.chapter ?? state) as ListFilters['state'],
      staffLeadId,
    });
  }

  @Post()
  @RequirePermission('outside_programs.create')
  create(
    @Body(zodBody(outsideProgramSchema)) body: OutsideProgramInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.create(body, user);
  }

  // ── Enrollments — declared before ':id' so static prefixes match first ────

  @Post('enrollments')
  @RequirePermission('outside_programs.create')
  enroll(
    @Body(zodBody(outsideEnrollmentSchema)) body: OutsideEnrollmentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.enroll(body, user);
  }

  @Patch('enrollments/:id')
  @RequirePermission('outside_programs.update')
  updateEnrollment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(enrollmentUpdateSchema)) body: OutsideEnrollmentUpdate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.updateEnrollment(id, body, user);
  }

  @Delete('enrollments/:id')
  @RequirePermission('outside_programs.delete')
  removeEnrollment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.softDeleteEnrollment(id, user);
  }

  // ── Sessions & attendance ─────────────────────────────────────────────────

  @Get('sessions/:sessionId')
  @RequirePermission('outside_programs.read')
  getSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.getSession(sessionId, user);
  }

  @Patch('sessions/:sessionId')
  @RequirePermission('outside_programs.update')
  updateSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(zodBody(sessionUpdateSchema)) body: Partial<OutsideSessionInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.updateSession(sessionId, body, user);
  }

  @Delete('sessions/:sessionId')
  @RequirePermission('outside_programs.delete')
  removeSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.deleteSession(sessionId, user);
  }

  @Post('sessions/:sessionId/attendance')
  @RequirePermission('outside_programs.update')
  recordAttendance(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(zodBody(attendanceSchema)) body: AttendanceBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.recordAttendance(sessionId, body.rows, user);
  }

  @Get(':id/sessions')
  @RequirePermission('outside_programs.read')
  listSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.listSessions(id, user);
  }

  @Post(':id/sessions')
  @RequirePermission('outside_programs.create')
  createSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(sessionSchema)) body: OutsideSessionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.createSession(id, body, user);
  }

  // ── Program detail / update / delete ──────────────────────────────────────

  @Get(':id')
  @RequirePermission('outside_programs.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.programs.get(id, user);
  }

  @Patch(':id')
  @RequirePermission('outside_programs.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(programUpdateSchema)) body: OutsideProgramUpdate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('outside_programs.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.programs.softDelete(id, user);
  }
}
