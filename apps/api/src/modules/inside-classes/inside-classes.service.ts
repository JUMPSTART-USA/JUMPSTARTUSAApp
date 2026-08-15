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
  type BatchEnrollInput,
  type ClassCloseOutInput,
  type ClassStatus,
  type EnrollmentStatus,
  type FinalAssessment,
  type InsideClassInput,
  type InsideEnrollmentInput,
  type ListQuery,
  type UsState,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface InsideClassListFilters {
  institutionId?: string;
  status?: ClassStatus;
  state?: UsState;
  from?: Date;
  to?: Date;
}

/** Local input shapes for the Phase 2 session/attendance endpoints — no shared schema yet. */
export interface InsideSessionInput {
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
const SORTABLE = new Set(['name', 'classType', 'startDate', 'endDate', 'status', 'createdAt']);

/** Merged-record view used to re-check the §6.2 cross-field enrollment rules. */
interface EnrollmentRuleState {
  status: EnrollmentStatus;
  enrollmentDate: Date;
  completionDate?: Date | null;
  leftEarlyDate?: Date | null;
  leftEarlyReason?: string | null;
  finalAssessment?: FinalAssessment | null;
}

@Injectable()
export class InsideClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Classes ───────────────────────────────────────────────────────────────

  async list(query: ListQuery, filters: InsideClassListFilters) {
    const where: Prisma.InsideClassWhereInput = {
      deletedAt: null,
      ...(filters.institutionId ? { institutionId: filters.institutionId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.state ? { institution: { state: filters.state } } : {}),
      ...(filters.from || filters.to
        ? {
            startDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { classType: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.InsideClassOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { startDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.insideClass.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          institution: { select: { id: true, name: true, state: true } },
          _count: { select: { enrollments: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.insideClass.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const insideClass = await this.prisma.insideClass.findFirst({
      where: { id, deletedAt: null },
      include: {
        institution: true,
        staffLead: { select: { id: true, firstName: true, lastName: true } },
        enrollments: {
          where: { deletedAt: null },
          orderBy: { participantProfile: { person: { lastName: 'asc' } } },
          include: {
            participantProfile: {
              select: {
                id: true,
                participantNumber: true,
                person: {
                  select: { firstName: true, lastName: true, preferredName: true },
                },
              },
            },
          },
        },
        volunteerAssignments: {
          where: { deletedAt: null },
          include: {
            volunteerProfile: {
              select: {
                id: true,
                person: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    if (!insideClass) throw new NotFoundException('Class not found');
    // Chapter scoping (§7.2): the list filter derives state from
    // institution.state — enforce identically on the loaded relation.
    assertChapterAccess(user.chapter, insideClass.institution.state);
    return insideClass;
  }

  async create(input: InsideClassInput, user: AuthenticatedUser) {
    const userId = user.id;
    await this.assertInstitution(input.institutionId);
    // Chapter scoping (§7.2): no creating classes at another chapter's institution.
    await this.assertClassChapter(input.institutionId, user.chapter);
    const insideClass = await this.prisma.insideClass.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'inside_class', insideClass.id, insideClass);
    return insideClass;
  }

  async update(id: string, input: Partial<InsideClassInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.getClassOrThrow(id);
    // Chapter scoping (§7.2): via the owning institution's state.
    await this.assertClassChapter(existing.institutionId, user.chapter);
    if (input.institutionId && input.institutionId !== existing.institutionId) {
      await this.assertInstitution(input.institutionId);
      // ...and the class cannot be moved to another chapter's institution.
      await this.assertClassChapter(input.institutionId, user.chapter);
    }
    // PATCH validates against innerType().partial(), which drops the schema's
    // cross-field refinement — re-check end >= start on the merged record.
    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;
    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('End date cannot be before start date');
    }
    const updated = await this.prisma.insideClass.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'inside_class', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.getClassOrThrow(id);
    // Chapter scoping (§7.2): via the owning institution's state.
    await this.assertClassChapter(existing.institutionId, user.chapter);
    // History preservation (§4.1.6): a class with a real roster is closed out,
    // never deleted. Only rosters consisting solely of removed enrollments
    // (data-entry mistakes) may be deleted.
    const blocking = await this.prisma.insideClassEnrollment.count({
      where: { insideClassId: id, deletedAt: null, completionStatus: { not: 'removed' } },
    });
    if (blocking > 0) {
      throw new ConflictException(
        'Class has enrollments that are not removed — close the class out instead of deleting it',
      );
    }
    await this.prisma.insideClass.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'inside_class', id, existing);
    return { ok: true };
  }

  // ── Enrollments ───────────────────────────────────────────────────────────

  /** Batch-enroll a roster (10–30 people at once, §6.2). Already-enrolled participants are skipped and reported. */
  async batchEnroll(classId: string, input: BatchEnrollInput, user: AuthenticatedUser) {
    const userId = user.id;
    if (input.insideClassId !== classId) {
      throw new BadRequestException('insideClassId in the body does not match the URL');
    }
    const insideClass = await this.getClassOrThrow(classId);
    // Chapter scoping (§7.2): via the owning institution's state.
    await this.assertClassChapter(insideClass.institutionId, user.chapter);
    if (insideClass.status === 'canceled') {
      throw new ConflictException('Cannot enroll participants into a canceled class');
    }

    const ids = [...new Set(input.participantProfileIds)];
    const participants = await this.prisma.participantProfile.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, chapterState: true },
    });
    const found = new Set(participants.map((p) => p.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown participant profile(s): ${missing.join(', ')}`);
    }
    // Chapter scoping (§7.2): no enrolling another chapter's participants.
    for (const participant of participants) {
      assertChapterAccess(user.chapter, participant.chapterState);
    }

    // Soft-deleted enrollments still occupy the (participant, class) unique
    // constraint, so they count as "already enrolled" for skip purposes.
    const existing = await this.prisma.insideClassEnrollment.findMany({
      where: { insideClassId: classId, participantProfileId: { in: ids } },
      select: { participantProfileId: true },
    });
    const skipped = existing.map((e) => e.participantProfileId);
    const skippedSet = new Set(skipped);
    const toEnroll = ids.filter((id) => !skippedSet.has(id));

    const enrolled = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const participantProfileId of toEnroll) {
        rows.push(
          await tx.insideClassEnrollment.create({
            data: {
              participantProfileId,
              insideClassId: classId,
              enrollmentDate: input.enrollmentDate,
              createdById: userId,
              updatedById: userId,
            },
          }),
        );
      }
      return rows;
    });

    for (const row of enrolled) {
      await this.audit.logCreate(userId, 'inside_class_enrollment', row.id, row);
    }

    return { enrolled, skippedParticipantProfileIds: skipped };
  }

  async enroll(input: InsideEnrollmentInput, user: AuthenticatedUser) {
    const userId = user.id;
    const insideClass = await this.getClassOrThrow(input.insideClassId);
    // Chapter scoping (§7.2): via the owning institution's state.
    await this.assertClassChapter(insideClass.institutionId, user.chapter);
    if (insideClass.status === 'canceled') {
      throw new ConflictException('Cannot enroll participants into a canceled class');
    }
    const participant = await this.prisma.participantProfile.findFirst({
      where: { id: input.participantProfileId, deletedAt: null },
      select: { id: true, chapterState: true },
    });
    if (!participant) throw new BadRequestException('Unknown participant profile');
    // Chapter scoping (§7.2): no enrolling another chapter's participant.
    assertChapterAccess(user.chapter, participant.chapterState);

    const duplicate = await this.prisma.insideClassEnrollment.findFirst({
      where: { insideClassId: input.insideClassId, participantProfileId: input.participantProfileId },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Participant is already enrolled in this class');
    }

    const { status, ...rest } = input;
    const enrollment = await this.prisma.insideClassEnrollment.create({
      data: { ...rest, completionStatus: status, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'inside_class_enrollment', enrollment.id, enrollment);
    return enrollment;
  }

  async updateEnrollment(
    enrollmentId: string,
    input: Partial<InsideEnrollmentInput>,
    user: AuthenticatedUser,
  ) {
    const userId = user.id;
    const loaded = await this.prisma.insideClassEnrollment.findFirst({
      where: { id: enrollmentId, deletedAt: null },
      include: { insideClass: { select: { institution: { select: { state: true } } } } },
    });
    if (!loaded) throw new NotFoundException('Enrollment not found');
    // Chapter scoping (§7.2): via the class's institution state.
    assertChapterAccess(user.chapter, loaded.insideClass.institution.state);
    const { insideClass: _insideClass, ...existing } = loaded;

    // History preservation (§4.1.6): an enrollment never moves between people
    // or classes — close it and open a new one instead.
    if (input.participantProfileId && input.participantProfileId !== existing.participantProfileId) {
      throw new BadRequestException(
        'An enrollment cannot be moved to another participant — create a new enrollment instead',
      );
    }
    if (input.insideClassId && input.insideClassId !== existing.insideClassId) {
      throw new BadRequestException(
        'An enrollment cannot be moved to another class — create a new enrollment instead',
      );
    }

    // PATCH validates against innerType().partial(), which drops the schema's
    // cross-field refinements — re-check them on the MERGED record (§6.2).
    this.assertEnrollmentRules({
      status: input.status ?? existing.completionStatus,
      enrollmentDate: input.enrollmentDate ?? existing.enrollmentDate,
      completionDate: input.completionDate ?? existing.completionDate,
      leftEarlyDate: input.leftEarlyDate ?? existing.leftEarlyDate,
      leftEarlyReason: input.leftEarlyReason ?? existing.leftEarlyReason,
      finalAssessment: input.finalAssessment ?? existing.finalAssessment,
    });

    const { status, participantProfileId: _p, insideClassId: _c, ...rest } = input;
    const updated = await this.prisma.insideClassEnrollment.update({
      where: { id: enrollmentId },
      data: {
        ...rest,
        ...(status ? { completionStatus: status } : {}),
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'inside_class_enrollment', enrollmentId, existing, updated);
    return updated;
  }

  /**
   * Close out a class: walk the roster in one transaction (§6.2 — a single
   * roster grid, not one form per participant). The class flips to completed
   * only once EVERY enrollment is terminal — assessment_pending rows keep the
   * class open until their Blue/Green/Yellow/Red assessments are in.
   */
  async closeOut(classId: string, input: ClassCloseOutInput, user: AuthenticatedUser) {
    const userId = user.id;
    const insideClass = await this.getClassOrThrow(classId);
    // Chapter scoping (§7.2): via the owning institution's state.
    await this.assertClassChapter(insideClass.institutionId, user.chapter);
    if (insideClass.status === 'canceled') {
      throw new ConflictException('A canceled class cannot be closed out');
    }

    const rowIds = input.rows.map((r) => r.enrollmentId);
    if (new Set(rowIds).size !== rowIds.length) {
      throw new BadRequestException('Duplicate enrollmentId in close-out rows');
    }
    const enrollments = await this.prisma.insideClassEnrollment.findMany({
      where: { id: { in: rowIds }, insideClassId: classId, deletedAt: null },
    });
    const byId = new Map(enrollments.map((e) => [e.id, e]));
    const foreign = rowIds.filter((id) => !byId.has(id));
    if (foreign.length > 0) {
      throw new BadRequestException(
        `Enrollment(s) not on this class roster: ${foreign.join(', ')}`,
      );
    }

    // Zod checked each row internally (left_early ⇒ date+reason, completed ⇒
    // assessment); dates against the stored enrollmentDate are cross-record.
    for (const row of input.rows) {
      const enrollment = byId.get(row.enrollmentId)!;
      this.assertEnrollmentRules({
        status: row.status,
        enrollmentDate: enrollment.enrollmentDate,
        completionDate: row.completionDate ?? enrollment.completionDate,
        leftEarlyDate: row.leftEarlyDate ?? enrollment.leftEarlyDate,
        leftEarlyReason: row.leftEarlyReason ?? enrollment.leftEarlyReason,
        finalAssessment: row.finalAssessment ?? enrollment.finalAssessment,
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updates = [];
      for (const row of input.rows) {
        const updated = await tx.insideClassEnrollment.update({
          where: { id: row.enrollmentId },
          data: {
            completionStatus: row.status,
            completionDate: row.completionDate,
            leftEarlyDate: row.leftEarlyDate,
            leftEarlyReason: row.leftEarlyReason,
            finalAssessment: row.finalAssessment,
            assessmentNotes: row.assessmentNotes,
            updatedById: userId,
          },
        });
        updates.push({ old: byId.get(row.enrollmentId)!, new: updated });
      }

      const openCount = await tx.insideClassEnrollment.count({
        where: {
          insideClassId: classId,
          deletedAt: null,
          completionStatus: { notIn: [...ENROLLMENT_EXIT_STATUSES] },
        },
      });
      let updatedClass = null;
      if (openCount === 0 && insideClass.status !== 'completed') {
        updatedClass = await tx.insideClass.update({
          where: { id: classId },
          data: { status: 'completed', updatedById: userId },
        });
      }
      return { updates, updatedClass, openCount };
    });

    for (const { old, new: updated } of result.updates) {
      await this.audit.logUpdate(userId, 'inside_class_enrollment', updated.id, old, updated);
    }
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'inside_class',
      entityId: classId,
      metadata: {
        closeOut: true,
        rowsUpdated: result.updates.length,
        classCompleted: result.updatedClass !== null,
        openEnrollments: result.openCount,
      },
    });

    return {
      rows: result.updates.map((u) => u.new),
      classStatus: result.updatedClass?.status ?? insideClass.status,
      openEnrollments: result.openCount,
    };
  }

  // ── Sessions & attendance (Phase 2 schema, endpoints ship now) ────────────

  async createSession(classId: string, input: InsideSessionInput, user: AuthenticatedUser) {
    const userId = user.id;
    const insideClass = await this.getClassOrThrow(classId);
    // Chapter scoping (§7.2): via the owning institution's state.
    await this.assertClassChapter(insideClass.institutionId, user.chapter);
    const session = await this.prisma.insideClassSession.create({
      data: { ...input, insideClassId: classId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'inside_class_session', session.id, session);
    return session;
  }

  async listSessions(classId: string, user: AuthenticatedUser) {
    const insideClass = await this.getClassOrThrow(classId);
    // Chapter scoping (§7.2): via the owning institution's state.
    await this.assertClassChapter(insideClass.institutionId, user.chapter);
    return this.prisma.insideClassSession.findMany({
      where: { insideClassId: classId },
      orderBy: { sessionDate: 'asc' },
      include: { attendance: true },
    });
  }

  async updateSession(
    sessionId: string,
    input: Partial<InsideSessionInput>,
    user: AuthenticatedUser,
  ) {
    const userId = user.id;
    const loaded = await this.prisma.insideClassSession.findUnique({
      where: { id: sessionId },
      include: { insideClass: { select: { institution: { select: { state: true } } } } },
    });
    if (!loaded) throw new NotFoundException('Session not found');
    // Chapter scoping (§7.2): via the class's institution state.
    assertChapterAccess(user.chapter, loaded.insideClass.institution.state);
    const { insideClass: _insideClass, ...existing } = loaded;
    const session = await this.prisma.insideClassSession.update({
      where: { id: sessionId },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'inside_class_session', sessionId, existing, session);
    return session;
  }

  /** Hard delete — sessions have no soft-delete column; attendance goes with them. */
  async deleteSession(sessionId: string, user: AuthenticatedUser) {
    const userId = user.id;
    const loaded = await this.prisma.insideClassSession.findUnique({
      where: { id: sessionId },
      include: { insideClass: { select: { institution: { select: { state: true } } } } },
    });
    if (!loaded) throw new NotFoundException('Session not found');
    // Chapter scoping (§7.2): via the class's institution state.
    assertChapterAccess(user.chapter, loaded.insideClass.institution.state);
    const { insideClass: _insideClass, ...existing } = loaded;
    await this.prisma.$transaction([
      this.prisma.sessionAttendance.deleteMany({ where: { sessionId } }),
      this.prisma.insideClassSession.delete({ where: { id: sessionId } }),
    ]);
    await this.audit.logDelete(userId, 'inside_class_session', sessionId, existing);
    return { ok: true };
  }

  /** Upserts one SessionAttendance row per (session, enrollment) — re-submitting the grid corrects it. */
  async recordAttendance(sessionId: string, rows: AttendanceRowInput[], user: AuthenticatedUser) {
    const userId = user.id;
    const session = await this.prisma.insideClassSession.findFirst({
      where: { id: sessionId },
      include: {
        insideClass: {
          select: { deletedAt: true, institution: { select: { state: true } } },
        },
      },
    });
    if (!session || session.insideClass.deletedAt) {
      throw new NotFoundException('Session not found');
    }
    // Chapter scoping (§7.2): via the class's institution state.
    assertChapterAccess(user.chapter, session.insideClass.institution.state);

    const enrollmentIds = rows.map((r) => r.enrollmentId);
    const valid = await this.prisma.insideClassEnrollment.findMany({
      where: { id: { in: enrollmentIds }, insideClassId: session.insideClassId, deletedAt: null },
      select: { id: true },
    });
    const validSet = new Set(valid.map((e) => e.id));
    const foreign = enrollmentIds.filter((id) => !validSet.has(id));
    if (foreign.length > 0) {
      throw new BadRequestException(
        `Enrollment(s) not on this class roster: ${foreign.join(', ')}`,
      );
    }

    const attendance = await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.sessionAttendance.upsert({
          where: { sessionId_enrollmentId: { sessionId, enrollmentId: row.enrollmentId } },
          create: {
            sessionId,
            enrollmentId: row.enrollmentId,
            status: row.status,
            notes: row.notes,
          },
          update: { status: row.status, notes: row.notes },
        }),
      ),
    );

    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'inside_class_session',
      entityId: sessionId,
      metadata: { attendanceRows: attendance.length },
    });

    return { sessionId, attendance };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getClassOrThrow(id: string) {
    const insideClass = await this.prisma.insideClass.findFirst({
      where: { id, deletedAt: null },
    });
    if (!insideClass) throw new NotFoundException('Class not found');
    return insideClass;
  }

  private async assertInstitution(institutionId: string) {
    const institution = await this.prisma.institution.findFirst({
      where: { id: institutionId, deletedAt: null },
      select: { id: true },
    });
    if (!institution) throw new BadRequestException('Unknown institution');
  }

  /**
   * Chapter scoping (§7.2): a class belongs to its institution's chapter —
   * the same derivation the list filter uses (institution.state). Only
   * queries when the user is actually chapter-scoped.
   */
  private async assertClassChapter(institutionId: string, userChapter: string | null) {
    if (!userChapter) return;
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      select: { state: true },
    });
    /**
     * A MISSING institution is refused rather than skipped. `institution?.state`
     * gave undefined for a nonexistent id, which the guard read as
     * "chapter-neutral, allow" — so the chapter check was quietly skipped for
     * exactly the input that should not have got this far. The write behind it
     * would have failed on a foreign key anyway, but failing for the right
     * reason is the difference between a 400 and a 500.
     */
    if (!institution) throw new BadRequestException('Unknown institution');
    assertChapterAccess(userChapter, institution.state);
  }

  /** §6.2 cross-field rules, mirrored from the shared Zod schemas for merged-record checks. */
  private assertEnrollmentRules(m: EnrollmentRuleState) {
    if (m.status === 'left_early' && (!m.leftEarlyDate || !m.leftEarlyReason)) {
      throw new BadRequestException(
        'Left-early enrollments require both a left-early date and a reason',
      );
    }
    if (m.status === 'completed' && !m.finalAssessment) {
      throw new BadRequestException(
        'A final assessment (Blue/Green/Yellow/Red) is required to mark completed — use assessment_pending until it is in',
      );
    }
    if (m.completionDate && m.completionDate.getTime() < m.enrollmentDate.getTime()) {
      throw new BadRequestException('Completion date cannot be before enrollment date');
    }
    if (m.leftEarlyDate && m.leftEarlyDate.getTime() < m.enrollmentDate.getTime()) {
      throw new BadRequestException('Left-early date cannot be before enrollment date');
    }
  }
}
