import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import {
  ENROLLMENT_EXIT_STATUSES,
  type AttendanceStatus,
  type ListQuery,
  type OutsideEnrollmentInput,
  type OutsideProgramInput,
  type ProgramType,
  type UsState,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface OutsideProgramListFilters {
  programType?: ProgramType;
  status?: 'active' | 'inactive' | 'completed';
  state?: UsState;
  staffLeadId?: string;
}

export type OutsideProgramUpdate = Partial<OutsideProgramInput>;
export type OutsideEnrollmentUpdate = Partial<
  Omit<OutsideEnrollmentInput, 'participantProfileId' | 'outsideProgramId'>
>;

export interface OutsideSessionInput {
  sessionDate: Date;
  topic?: string;
  notes?: string;
}

export interface AttendanceRowInput {
  enrollmentId: string;
  status: AttendanceStatus;
  notes?: string;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'programType', 'state', 'status', 'startDate', 'createdAt']);

const PARTICIPANT_NAME_SELECT = {
  id: true,
  participantNumber: true,
  person: { select: { firstName: true, lastName: true, preferredName: true } },
} as const;

@Injectable()
export class OutsideProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: OutsideProgramListFilters) {
    const where: Prisma.OutsideProgramWhereInput = {
      deletedAt: null,
      ...(filters.programType ? { programType: filters.programType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.staffLeadId ? { staffLeadId: filters.staffLeadId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
              { volunteerLeadName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.OutsideProgramOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.outsideProgram.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          staffLead: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { enrollments: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.outsideProgram.count({ where }),
    ]);

    // Active (not-yet-exited) enrollment counts drive the capacity display.
    const ids = rows.map((r) => r.id);
    const activeCounts = ids.length
      ? await this.prisma.outsideProgramEnrollment.groupBy({
          by: ['outsideProgramId'],
          where: {
            outsideProgramId: { in: ids },
            deletedAt: null,
            status: { notIn: [...ENROLLMENT_EXIT_STATUSES] },
          },
          _count: { _all: true },
        })
      : [];
    const activeById = new Map(activeCounts.map((c) => [c.outsideProgramId, c._count._all]));

    const items = rows.map((r) => ({ ...r, activeEnrollmentCount: activeById.get(r.id) ?? 0 }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Program detail with full roster (participant names, §6.3). */
  async get(id: string, user: AuthenticatedUser) {
    const program = await this.prisma.outsideProgram.findFirst({
      where: { id, deletedAt: null },
      include: {
        staffLead: { select: { id: true, firstName: true, lastName: true } },
        enrollments: {
          where: { deletedAt: null },
          orderBy: { participantProfile: { person: { lastName: 'asc' } } },
          include: { participantProfile: { select: PARTICIPANT_NAME_SELECT } },
        },
      },
    });
    if (!program) throw new NotFoundException('Outside program not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own state).
    assertChapterAccess(user.chapter, program.state);
    return program;
  }

  async create(input: OutsideProgramInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): stamp the creator's chapter; all-chapters users
    // must pick one explicitly.
    const state = resolveCreateChapter(user.chapter, input.state);
    await this.assertStaffLead(input.staffLeadId);
    const program = await this.prisma.outsideProgram.create({
      data: { ...input, state, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'outside_program', program.id, program);
    return program;
  }

  async update(id: string, input: OutsideProgramUpdate, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findProgram(id);
    // Chapter scoping (§7.2): the record must be in the user's chapter, and a
    // scoped user cannot move it to another chapter either.
    assertChapterAccess(user.chapter, existing.state);
    assertChapterAccess(user.chapter, input.state);
    await this.assertStaffLead(input.staffLeadId);

    // Merged-state check: the Zod refinement only sees the patch payload.
    const start = input.startDate ?? existing.startDate;
    const end = input.endDate ?? existing.endDate;
    if (start && end && end < start) {
      throw new BadRequestException('End date cannot be before start date');
    }

    const updated = await this.prisma.outsideProgram.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'outside_program', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findProgram(id);
    // Chapter scoping (§7.2): same derivation as the list filter (own state).
    assertChapterAccess(user.chapter, existing.state);
    // History preservation (§4.1.6): open enrollments must be closed out, not
    // hidden behind a deleted program.
    const open = await this.prisma.outsideProgramEnrollment.count({
      where: {
        outsideProgramId: id,
        deletedAt: null,
        status: { notIn: [...ENROLLMENT_EXIT_STATUSES] },
      },
    });
    if (open > 0) {
      throw new ConflictException(
        `Program still has ${open} open enrollment(s) — close them out before deleting`,
      );
    }
    await this.prisma.outsideProgram.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'outside_program', id, existing);
    return { ok: true };
  }

  // ── Enrollments (§6.3 — same close-out rules as inside classes) ───────────

  async enroll(input: OutsideEnrollmentInput, user: AuthenticatedUser) {
    const userId = user.id;
    const program = await this.findProgram(input.outsideProgramId);
    // Chapter scoping (§7.2): no enrolling into another chapter's program.
    assertChapterAccess(user.chapter, program.state);
    const participant = await this.prisma.participantProfile.findFirst({
      where: { id: input.participantProfileId, deletedAt: null },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    // Chapter scoping (§7.2): no enrolling another chapter's participant.
    assertChapterAccess(user.chapter, participant.chapterState);

    // Re-enrollment after an exit is normal (history preserved); a second
    // concurrently-open enrollment in the same program is a data error.
    const open = await this.prisma.outsideProgramEnrollment.findFirst({
      where: {
        participantProfileId: input.participantProfileId,
        outsideProgramId: input.outsideProgramId,
        deletedAt: null,
        status: { notIn: [...ENROLLMENT_EXIT_STATUSES] },
      },
    });
    if (open) {
      throw new ConflictException(
        'Participant already has an open enrollment in this program — close it out before re-enrolling',
      );
    }

    // Capacity WARNS, never blocks (§6.3/§6.4: real life overrides software).
    const warnings: string[] = [];
    const enrollingOpen = !(ENROLLMENT_EXIT_STATUSES as readonly string[]).includes(input.status);
    if (program.capacity != null && enrollingOpen) {
      const active = await this.prisma.outsideProgramEnrollment.count({
        where: {
          outsideProgramId: program.id,
          deletedAt: null,
          status: { notIn: [...ENROLLMENT_EXIT_STATUSES] },
        },
      });
      if (active >= program.capacity) {
        warnings.push(
          `${program.name} is at capacity (${active}/${program.capacity} active) — enrollment recorded anyway`,
        );
      }
    }

    const enrollment = await this.prisma.outsideProgramEnrollment.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'outside_program_enrollment', enrollment.id, enrollment);
    return { ...enrollment, warnings };
  }

  async updateEnrollment(id: string, input: OutsideEnrollmentUpdate, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findEnrollment(user, id);

    // Re-validate §6.2/§6.3 close-out rules against the MERGED record: a
    // partial update must not produce a state the full-payload schema rejects.
    const merged = {
      status: input.status ?? existing.status,
      enrollmentDate: input.enrollmentDate ?? existing.enrollmentDate,
      completionDate: input.completionDate ?? existing.completionDate,
      leftEarlyDate: input.leftEarlyDate ?? existing.leftEarlyDate,
      leftEarlyReason: input.leftEarlyReason ?? existing.leftEarlyReason,
      completionAssessment: input.completionAssessment ?? existing.completionAssessment,
    };
    if (merged.status === 'left_early' && (!merged.leftEarlyDate || !merged.leftEarlyReason)) {
      throw new BadRequestException('Leaving early requires both a left-early date and a reason');
    }
    if (merged.status === 'completed' && !merged.completionAssessment) {
      throw new BadRequestException(
        'A completion assessment (Blue/Green/Yellow/Red) is required to mark completed — use "assessment pending" until it is in',
      );
    }
    if (merged.completionDate && merged.completionDate < merged.enrollmentDate) {
      throw new BadRequestException('Completion date cannot be before enrollment date');
    }
    if (merged.leftEarlyDate && merged.leftEarlyDate < merged.enrollmentDate) {
      throw new BadRequestException('Left-early date cannot be before enrollment date');
    }

    const updated = await this.prisma.outsideProgramEnrollment.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'outside_program_enrollment', id, existing, updated);
    return updated;
  }

  /** Soft delete is for true data errors only — exits are status changes. */
  async softDeleteEnrollment(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findEnrollment(user, id);
    await this.prisma.outsideProgramEnrollment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'outside_program_enrollment', id, existing);
    return { ok: true };
  }

  // ── Sessions & attendance (mirrors the inside-class session model) ────────

  async listSessions(programId: string, user: AuthenticatedUser) {
    const program = await this.findProgram(programId);
    // Chapter scoping (§7.2): derived through the parent program.
    assertChapterAccess(user.chapter, program.state);
    return this.prisma.outsideProgramSession.findMany({
      where: { outsideProgramId: programId },
      orderBy: { sessionDate: 'desc' },
      include: { _count: { select: { attendance: true } } },
    });
  }

  async getSession(sessionId: string, user: AuthenticatedUser) {
    const session = await this.prisma.outsideProgramSession.findUnique({
      where: { id: sessionId },
      include: {
        outsideProgram: { select: { id: true, name: true, state: true } },
        attendance: {
          include: {
            enrollment: {
              select: {
                id: true,
                status: true,
                participantProfile: { select: PARTICIPANT_NAME_SELECT },
              },
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    // Chapter scoping (§7.2): the roster (participant names) must not leak
    // across chapters — derived through the parent program.
    assertChapterAccess(user.chapter, session.outsideProgram.state);
    return session;
  }

  async createSession(programId: string, input: OutsideSessionInput, user: AuthenticatedUser) {
    const userId = user.id;
    const program = await this.findProgram(programId);
    // Chapter scoping (§7.2): derived through the parent program.
    assertChapterAccess(user.chapter, program.state);
    const session = await this.prisma.outsideProgramSession.create({
      data: { ...input, outsideProgramId: programId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'outside_program_session', session.id, session);
    return session;
  }

  async updateSession(
    sessionId: string,
    input: Partial<OutsideSessionInput>,
    user: AuthenticatedUser,
  ) {
    const userId = user.id;
    const existing = await this.findSession(user, sessionId);
    const updated = await this.prisma.outsideProgramSession.update({
      where: { id: sessionId },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'outside_program_session', sessionId, existing, updated);
    return updated;
  }

  /** Hard delete — sessions have no soft-delete column; attendance goes with them. */
  async deleteSession(sessionId: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findSession(user, sessionId);
    await this.prisma.$transaction([
      this.prisma.outsideSessionAttendance.deleteMany({ where: { sessionId } }),
      this.prisma.outsideProgramSession.delete({ where: { id: sessionId } }),
    ]);
    await this.audit.logDelete(userId, 'outside_program_session', sessionId, existing);
    return { ok: true };
  }

  /** Batch upsert — staff mark the whole roster in one save (§6.2 pattern). */
  async recordAttendance(sessionId: string, rows: AttendanceRowInput[], user: AuthenticatedUser) {
    const userId = user.id;
    const session = await this.findSession(user, sessionId);

    const ids = rows.map((r) => r.enrollmentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Attendance rows contain duplicate enrollments');
    }
    // Cross-record rule: rows must reference enrollments of THIS program.
    const valid = await this.prisma.outsideProgramEnrollment.count({
      where: { id: { in: ids }, outsideProgramId: session.outsideProgramId, deletedAt: null },
    });
    if (valid !== ids.length) {
      throw new BadRequestException('One or more rows reference enrollments outside this program');
    }

    const attendance = await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.outsideSessionAttendance.upsert({
          where: { sessionId_enrollmentId: { sessionId, enrollmentId: row.enrollmentId } },
          create: { sessionId, enrollmentId: row.enrollmentId, status: row.status, notes: row.notes },
          update: { status: row.status, notes: row.notes },
        }),
      ),
    );
    // One audit row for the batch — attendance rows carry no audit columns.
    await this.audit.logCreate(userId, 'outside_session_attendance', sessionId, { rows });
    return attendance;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async findProgram(id: string) {
    const program = await this.prisma.outsideProgram.findFirst({ where: { id, deletedAt: null } });
    if (!program) throw new NotFoundException('Outside program not found');
    return program;
  }

  private async findSession(user: AuthenticatedUser, id: string) {
    const session = await this.prisma.outsideProgramSession.findUnique({
      where: { id },
      include: { outsideProgram: { select: { state: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    // Chapter scoping (§7.2): derived through the parent program.
    assertChapterAccess(user.chapter, session.outsideProgram.state);
    const { outsideProgram: _program, ...sessionOnly } = session;
    return sessionOnly;
  }

  private async findEnrollment(user: AuthenticatedUser, id: string) {
    const enrollment = await this.prisma.outsideProgramEnrollment.findFirst({
      where: { id, deletedAt: null },
      include: { outsideProgram: { select: { state: true } } },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    // Chapter scoping (§7.2): derived through the parent program.
    assertChapterAccess(user.chapter, enrollment.outsideProgram.state);
    const { outsideProgram: _program, ...enrollmentOnly } = enrollment;
    return enrollmentOnly;
  }

  private async assertStaffLead(staffLeadId: string | undefined) {
    if (!staffLeadId) return;
    const user = await this.prisma.user.findFirst({ where: { id: staffLeadId, deletedAt: null } });
    if (!user) throw new BadRequestException('Staff lead not found');
  }
}
