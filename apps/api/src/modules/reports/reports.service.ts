import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import {
  ASSIGNMENT_TYPES,
  CHAPTER_STATES,
  ENROLLMENT_STATUSES,
  HOUSING_EXIT_STATUSES,
  INSIDE_STATUSES,
  OUTSIDE_STATUSES,
  PLEDGE_STATUSES,
  PROGRAM_TYPES,
  RECURRING_GIFT_STATUSES,
  type AssignmentType,
  type EnrollmentStatus,
  type InsideStatus,
  type OutsideStatus,
  type PermissionKey,
  type PledgeStatus,
  type ProgramType,
  type RecurringGiftStatus,
} from '@jumpstart/shared';
import { assertChapterAccess } from '../../common/chapter.util';
import { effectiveMailingAddress } from '../../common/mailing.util';
import { hasPerm, type AuthenticatedUser } from '../../common/types';
import { pledgeComputed } from '../crm/giving.util';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReportColumn {
  key: string;
  label: string;
}
export type ReportCell = string | number | boolean | null;
export type ReportRow = Record<string, ReportCell>;
export interface ReportResult {
  columns: ReportColumn[];
  rows: ReportRow[];
}

export interface ReportParamDef {
  name: string;
  label: string;
  type: 'uuid' | 'date' | 'enum' | 'number';
  required?: boolean;
  values?: readonly string[];
}

/** Union of every report's accepted params — each report reads its own subset. */
export interface ReportParams {
  state?: string;
  status?: string;
  insideClassId?: string;
  outsideProgramId?: string;
  institutionId?: string;
  from?: Date;
  to?: Date;
  programType?: ProgramType;
  caseManagerId?: string;
  assignmentType?: AssignmentType;
  expiringWithinDays?: number;
  campaignId?: string;
  participantProfileId?: string;
  employerId?: string;
  vehicleId?: string;
  opportunityId?: string;
  year?: number;
}

interface ReportDefinition {
  key: string;
  name: string;
  /** Domain read permission required ON TOP of reports.read/export (§7.2). */
  permission: PermissionKey;
  params: ReportParamDef[];
  run: (params: ReportParams, user: AuthenticatedUser) => Promise<ReportResult>;
}

const PARTICIPANT_STATUS_VALUES = [
  ...new Set<string>([...INSIDE_STATUSES, ...OUTSIDE_STATUSES]),
];

const DAY_MS = 86_400_000;
const addDays = (base: Date, days: number) => new Date(base.getTime() + days * DAY_MS);
/** Midnight UTC — matches how @db.Date columns store values. */
const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const fmtDate = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;
const num = (v: Prisma.Decimal | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);
const personName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const dateRange = (from?: Date, to?: Date) =>
  from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;

/** Sentinel bucket for case services whose participant has no assigned manager. */
const UNASSIGNED = '__unassigned__';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §9.2 registry: every report is one entry, and the list screen, the JSON
   * endpoint, and the CSV/XLSX exports all read the same {columns, rows}
   * source — no second source of truth.
   */
  private readonly registry: ReportDefinition[] = [
    {
      key: 'participant-status',
      name: 'Participant Status Summary',
      permission: 'participants.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'status', label: 'Status', type: 'enum', values: PARTICIPANT_STATUS_VALUES },
      ],
      run: (p) => this.participantStatus(p),
    },
    {
      key: 'inside-class-roster',
      name: 'Inside Class Roster',
      permission: 'inside_classes.read',
      params: [{ name: 'insideClassId', label: 'Inside Class', type: 'uuid', required: true }],
      run: (p, u) => this.insideClassRoster(p, u),
    },
    {
      key: 'inside-class-completions',
      name: 'Inside Class Completions & Assessments',
      permission: 'inside_classes.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'institutionId', label: 'Institution', type: 'uuid' },
        { name: 'from', label: 'From', type: 'date' },
        { name: 'to', label: 'To', type: 'date' },
      ],
      run: (p) => this.insideClassCompletions(p),
    },
    {
      key: 'inside-class-attendance',
      name: 'Inside Class Attendance',
      permission: 'inside_classes.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'institutionId', label: 'Institution', type: 'uuid' },
        { name: 'insideClassId', label: 'Inside Class', type: 'uuid' },
        { name: 'from', label: 'Sessions from', type: 'date' },
        { name: 'to', label: 'Sessions to', type: 'date' },
      ],
      run: (p, u) => this.insideClassAttendance(p, u),
    },
    {
      key: 'institution-activity',
      name: 'Institution Activity',
      permission: 'institutions.read',
      params: [{ name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES }],
      run: (p) => this.institutionActivity(p),
    },
    {
      key: 'outside-program-enrollment',
      name: 'Outside Program Enrollment',
      permission: 'outside_programs.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'programType', label: 'Program Type', type: 'enum', values: PROGRAM_TYPES },
        { name: 'status', label: 'Status', type: 'enum', values: ENROLLMENT_STATUSES },
      ],
      run: (p) => this.outsideProgramEnrollment(p),
    },
    {
      key: 'outside-program-attendance',
      name: 'Outside Program Attendance',
      permission: 'outside_programs.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'programType', label: 'Program Type', type: 'enum', values: PROGRAM_TYPES },
        { name: 'outsideProgramId', label: 'Outside Program', type: 'uuid' },
        { name: 'from', label: 'Sessions from', type: 'date' },
        { name: 'to', label: 'Sessions to', type: 'date' },
      ],
      run: (p, u) => this.outsideProgramAttendance(p, u),
    },
    {
      key: 'housing-occupancy',
      name: 'Transitional Housing Occupancy',
      permission: 'housing.read',
      params: [{ name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES }],
      run: (p) => this.housingOccupancy(p),
    },
    {
      key: 'housing-exits',
      name: 'Housing Completions & Exits',
      permission: 'housing.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'from', label: 'From', type: 'date' },
        { name: 'to', label: 'To', type: 'date' },
      ],
      run: (p) => this.housingExits(p),
    },
    {
      key: 'case-activity',
      name: 'Case Management Activity (counts)',
      permission: 'case_management.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'caseManagerId', label: 'Case Manager', type: 'uuid' },
        { name: 'from', label: 'From', type: 'date' },
        { name: 'to', label: 'To', type: 'date' },
      ],
      run: (p) => this.caseActivity(p),
    },
    {
      key: 'volunteer-assignments',
      name: 'Volunteer Assignments',
      permission: 'volunteers.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'institutionId', label: 'Institution', type: 'uuid' },
        { name: 'assignmentType', label: 'Assignment Type', type: 'enum', values: ASSIGNMENT_TYPES },
      ],
      run: (p) => this.volunteerAssignments(p),
    },
    {
      key: 'volunteer-trainings',
      name: 'Volunteer Trainings',
      permission: 'volunteers.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'expiringWithinDays', label: 'Expiring Within (days)', type: 'number' },
      ],
      run: (p) => this.volunteerTrainings(p),
    },
    {
      key: 'donor-giving',
      name: 'Donor Giving History',
      permission: 'donors.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'from', label: 'From', type: 'date' },
        { name: 'to', label: 'To', type: 'date' },
        { name: 'campaignId', label: 'Campaign', type: 'uuid' },
      ],
      run: (p) => this.donorGiving(p),
    },
    {
      key: 'campaign-performance',
      name: 'Campaign Performance',
      permission: 'campaigns.read',
      params: [{ name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES }],
      run: (p) => this.campaignPerformance(p),
    },
    {
      key: 'event-financials',
      name: 'Event Financial Summary',
      permission: 'events.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'from', label: 'From', type: 'date' },
        { name: 'to', label: 'To', type: 'date' },
      ],
      run: (p) => this.eventFinancials(p),
    },
    {
      key: 'pledge-status',
      name: 'Pledge Status',
      permission: 'donors.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'status', label: 'Status', type: 'enum', values: PLEDGE_STATUSES },
      ],
      run: (p) => this.pledgeStatus(p),
    },
    {
      key: 'recurring-gifts',
      name: 'Recurring Gifts',
      permission: 'donors.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'status', label: 'Status', type: 'enum', values: RECURRING_GIFT_STATUSES },
      ],
      run: (p) => this.recurringGifts(p),
    },
    {
      key: 'giving-statements',
      name: 'Year-End Giving Statements',
      permission: 'donors.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'year', label: 'Year', type: 'number', required: true },
      ],
      run: (p) => this.givingStatements(p),
    },
    {
      key: 'volunteer-hours',
      name: 'Volunteer Hours',
      permission: 'volunteers.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'from', label: 'From', type: 'date' },
        { name: 'to', label: 'To', type: 'date' },
        { name: 'opportunityId', label: 'Opportunity', type: 'uuid' },
      ],
      run: (p) => this.volunteerHours(p),
    },
    {
      key: 'employer-participation',
      name: 'Employer Participation',
      permission: 'employers.read',
      params: [{ name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES }],
      run: (p) => this.employerParticipation(p),
    },
    {
      key: 'employment-history',
      name: 'Participant Employment History',
      permission: 'employment.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'participantProfileId', label: 'Participant', type: 'uuid' },
        { name: 'employerId', label: 'Employer', type: 'uuid' },
      ],
      run: (p, u) => this.employmentHistory(p, u),
    },
    {
      key: 'vehicle-maintenance',
      name: 'Vehicle Maintenance History',
      permission: 'vehicles.read',
      params: [
        { name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES },
        { name: 'vehicleId', label: 'Vehicle', type: 'uuid' },
        { name: 'from', label: 'From', type: 'date' },
        { name: 'to', label: 'To', type: 'date' },
      ],
      run: (p) => this.vehicleMaintenance(p),
    },
    {
      key: 'upcoming-maintenance',
      name: 'Upcoming Vehicle Maintenance',
      permission: 'vehicles.read',
      params: [{ name: 'state', label: 'Chapter', type: 'enum', values: CHAPTER_STATES }],
      run: (p) => this.upcomingMaintenance(p),
    },
  ];

  /** Reports the user may run — the SPA builds its report list from this. */
  listAvailable(user: AuthenticatedUser) {
    return this.registry
      .filter((def) => hasPerm(user, def.permission))
      .map(({ key, name, params }) => ({ key, name, params }));
  }

  /** Display name for a report key — the PDF export header uses this. */
  reportName(key: string): string {
    return this.registry.find((r) => r.key === key)?.name ?? key;
  }

  async run(key: string, params: ReportParams, user: AuthenticatedUser): Promise<ReportResult> {
    const def = this.registry.find((r) => r.key === key);
    if (!def) throw new NotFoundException(`Unknown report: ${key}`);
    if (!hasPerm(user, def.permission)) {
      throw new ForbiddenException(`This report requires the ${def.permission} permission`);
    }
    return def.run(params, user);
  }

  /** Reports whose status vocabulary is report-specific validate it here. */
  private validateEnum(
    value: string | undefined,
    allowed: readonly string[],
    name: string,
  ): string | undefined {
    if (value === undefined) return undefined;
    if (!allowed.includes(value)) {
      throw new BadRequestException(`Invalid ${name} — expected one of: ${allowed.join(', ')}`);
    }
    return value;
  }

  // ── Participants ──────────────────────────────────────────────────────────

  private async participantStatus(p: ReportParams): Promise<ReportResult> {
    const status = this.validateEnum(p.status, PARTICIPANT_STATUS_VALUES, 'status');
    const or: Prisma.ParticipantProfileWhereInput[] = [];
    if (status) {
      if ((INSIDE_STATUSES as readonly string[]).includes(status)) {
        or.push({ insideStatus: status as InsideStatus });
      }
      if ((OUTSIDE_STATUSES as readonly string[]).includes(status)) {
        or.push({ outsideStatus: status as OutsideStatus });
      }
    }
    const rows = await this.prisma.participantProfile.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): filter by the profile's chapter, never the
        // person's mailing-address state.
        ...(p.state ? { chapterState: p.state } : {}),
        ...(or.length ? { OR: or } : {}),
      },
      orderBy: { participantNumber: 'asc' },
      select: {
        participantNumber: true,
        insideStatus: true,
        outsideStatus: true,
        alumniStatus: true,
        phase: true,
        intakeDate: true,
        releaseDate: true,
        graduationDate: true,
        person: { select: { firstName: true, lastName: true, state: true } },
        assignedCaseManager: { select: { firstName: true, lastName: true } },
      },
    });
    return {
      columns: [
        { key: 'participantNumber', label: 'Participant ID' },
        { key: 'name', label: 'Name' },
        { key: 'state', label: 'State' },
        { key: 'insideStatus', label: 'Inside Status' },
        { key: 'outsideStatus', label: 'Outside Status' },
        { key: 'alumniStatus', label: 'Alumni Status' },
        { key: 'phase', label: 'Phase' },
        { key: 'intakeDate', label: 'Intake Date' },
        { key: 'releaseDate', label: 'Release Date' },
        { key: 'graduationDate', label: 'Graduation Date' },
        { key: 'caseManager', label: 'Case Manager' },
      ],
      rows: rows.map((r) => ({
        participantNumber: r.participantNumber,
        name: personName(r.person),
        state: r.person.state ?? null,
        insideStatus: r.insideStatus,
        outsideStatus: r.outsideStatus,
        alumniStatus: r.alumniStatus,
        phase: r.phase ?? null,
        intakeDate: fmtDate(r.intakeDate),
        releaseDate: fmtDate(r.releaseDate),
        graduationDate: fmtDate(r.graduationDate),
        caseManager: r.assignedCaseManager ? personName(r.assignedCaseManager) : null,
      })),
    };
  }

  // ── Inside programming ────────────────────────────────────────────────────

  private async insideClassRoster(
    p: ReportParams,
    user: AuthenticatedUser,
  ): Promise<ReportResult> {
    if (!p.insideClassId) throw new BadRequestException('insideClassId is required');
    const cls = await this.prisma.insideClass.findFirst({
      where: { id: p.insideClassId, deletedAt: null },
      select: { name: true, institution: { select: { name: true, state: true } } },
    });
    if (!cls) throw new NotFoundException('Inside class not found');
    // Chapter scoping (§7.2): a scoped user cannot pull another chapter's
    // roster by id — the class's chapter is its institution's state.
    assertChapterAccess(user.chapter, cls.institution.state);

    const enrollments = await this.prisma.insideClassEnrollment.findMany({
      where: { insideClassId: p.insideClassId, deletedAt: null },
      orderBy: { enrollmentDate: 'asc' },
      select: {
        enrollmentDate: true,
        completionStatus: true,
        completionDate: true,
        finalAssessment: true,
        leftEarlyDate: true,
        leftEarlyReason: true,
        participantProfile: {
          select: {
            participantNumber: true,
            person: { select: { firstName: true, lastName: true } },
            docIds: { select: { state: true, docNumber: true } },
          },
        },
      },
    });

    // §7.2 justice field class: the DOC-number column exists only for holders
    // of fields.justice.read — dropped entirely (not blanked) otherwise.
    const showDoc = hasPerm(user, 'fields.justice.read');
    return {
      columns: [
        { key: 'institution', label: 'Institution' },
        { key: 'className', label: 'Class' },
        { key: 'participantNumber', label: 'Participant ID' },
        { key: 'name', label: 'Name' },
        ...(showDoc ? [{ key: 'docNumbers', label: 'DOC Number(s)' }] : []),
        { key: 'enrollmentDate', label: 'Enrollment Date' },
        { key: 'completionStatus', label: 'Status' },
        { key: 'completionDate', label: 'Completion Date' },
        { key: 'finalAssessment', label: 'Final Assessment' },
        { key: 'leftEarlyDate', label: 'Left Early Date' },
        { key: 'leftEarlyReason', label: 'Left Early Reason' },
      ],
      rows: enrollments.map((e) => ({
        institution: cls.institution.name,
        className: cls.name,
        participantNumber: e.participantProfile.participantNumber,
        name: personName(e.participantProfile.person),
        ...(showDoc
          ? {
              docNumbers:
                e.participantProfile.docIds.map((d) => `${d.state} ${d.docNumber}`).join('; ') ||
                null,
            }
          : {}),
        enrollmentDate: fmtDate(e.enrollmentDate),
        completionStatus: e.completionStatus,
        completionDate: fmtDate(e.completionDate),
        finalAssessment: e.finalAssessment ?? null,
        leftEarlyDate: fmtDate(e.leftEarlyDate),
        leftEarlyReason: e.leftEarlyReason ?? null,
      })),
    };
  }

  // ── Attendance stats — present + late count as attended; the rate is over
  // MARKED rows only (unmarked sessions are reported, never guessed) ─────────

  private static tallyAttendance(statuses: string[]) {
    const t = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const s of statuses) if (s in t) t[s as keyof typeof t] += 1;
    const marked = t.present + t.late + t.absent + t.excused;
    const rate = marked > 0 ? Math.round(((t.present + t.late) / marked) * 100) : null;
    return { ...t, marked, rate };
  }

  /**
   * Two granularities from one report: no class selected → one row per class
   * (aggregate), a class selected → one row per enrolled participant.
   */
  private async insideClassAttendance(
    p: ReportParams,
    user: AuthenticatedUser,
  ): Promise<ReportResult> {
    const sessionRange = dateRange(p.from, p.to);

    if (p.insideClassId) {
      const cls = await this.prisma.insideClass.findFirst({
        where: { id: p.insideClassId, deletedAt: null },
        select: {
          name: true,
          institution: { select: { name: true, state: true } },
          sessions: {
            where: sessionRange ? { sessionDate: sessionRange } : undefined,
            select: { id: true },
          },
        },
      });
      if (!cls) throw new NotFoundException('Inside class not found');
      // Chapter scoping (§7.2): a scoped user cannot pull another chapter's
      // attendance by id — the class's chapter is its institution's state.
      assertChapterAccess(user.chapter, cls.institution.state);

      const sessionIds = new Set(cls.sessions.map((s) => s.id));
      const enrollments = await this.prisma.insideClassEnrollment.findMany({
        where: { insideClassId: p.insideClassId, deletedAt: null },
        orderBy: { enrollmentDate: 'asc' },
        select: {
          completionStatus: true,
          participantProfile: {
            select: {
              participantNumber: true,
              person: { select: { firstName: true, lastName: true } },
            },
          },
          attendance: { select: { sessionId: true, status: true } },
        },
      });

      const sessionsHeld = sessionIds.size;
      return {
        columns: [
          { key: 'institution', label: 'Institution' },
          { key: 'className', label: 'Class' },
          { key: 'participantNumber', label: 'Participant ID' },
          { key: 'name', label: 'Name' },
          { key: 'enrollmentStatus', label: 'Enrollment Status' },
          { key: 'sessionsHeld', label: 'Sessions Held' },
          { key: 'present', label: 'Present' },
          { key: 'late', label: 'Late' },
          { key: 'absent', label: 'Absent' },
          { key: 'excused', label: 'Excused' },
          { key: 'notMarked', label: 'Not Marked' },
          { key: 'attendanceRate', label: 'Attendance %' },
        ],
        rows: enrollments.map((e) => {
          const t = ReportsService.tallyAttendance(
            e.attendance.filter((a) => sessionIds.has(a.sessionId)).map((a) => a.status),
          );
          return {
            institution: cls.institution.name,
            className: cls.name,
            participantNumber: e.participantProfile.participantNumber,
            name: personName(e.participantProfile.person),
            enrollmentStatus: e.completionStatus,
            sessionsHeld,
            present: t.present,
            late: t.late,
            absent: t.absent,
            excused: t.excused,
            notMarked: Math.max(0, sessionsHeld - t.marked),
            attendanceRate: t.rate,
          };
        }),
      };
    }

    const classes = await this.prisma.insideClass.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): a class's chapter is its institution's state.
        ...(p.state ? { institution: { state: p.state } } : {}),
        ...(p.institutionId ? { institutionId: p.institutionId } : {}),
      },
      orderBy: [{ startDate: 'desc' }],
      select: {
        name: true,
        status: true,
        institution: { select: { name: true, state: true } },
        _count: { select: { enrollments: { where: { deletedAt: null } } } },
        sessions: {
          where: sessionRange ? { sessionDate: sessionRange } : undefined,
          // Withdrawn (soft-deleted) enrollments' marks are excluded so the
          // summary tallies agree with the roster count beside them and with
          // the per-participant drill-down, which queries live enrollments.
          select: {
            attendance: {
              where: { enrollment: { deletedAt: null } },
              select: { status: true },
            },
          },
        },
      },
    });

    return {
      columns: [
        { key: 'institution', label: 'Institution' },
        { key: 'className', label: 'Class' },
        { key: 'classStatus', label: 'Class Status' },
        { key: 'roster', label: 'Roster' },
        { key: 'sessionsHeld', label: 'Sessions Held' },
        { key: 'present', label: 'Present' },
        { key: 'late', label: 'Late' },
        { key: 'absent', label: 'Absent' },
        { key: 'excused', label: 'Excused' },
        { key: 'attendanceRate', label: 'Attendance %' },
      ],
      rows: classes.map((c) => {
        const t = ReportsService.tallyAttendance(
          c.sessions.flatMap((s) => s.attendance.map((a) => a.status)),
        );
        return {
          institution: c.institution.name,
          className: c.name,
          classStatus: c.status,
          roster: c._count.enrollments,
          sessionsHeld: c.sessions.length,
          present: t.present,
          late: t.late,
          absent: t.absent,
          excused: t.excused,
          attendanceRate: t.rate,
        };
      }),
    };
  }

  /** Outside mirror of insideClassAttendance — same two granularities. */
  private async outsideProgramAttendance(
    p: ReportParams,
    user: AuthenticatedUser,
  ): Promise<ReportResult> {
    const sessionRange = dateRange(p.from, p.to);

    if (p.outsideProgramId) {
      const program = await this.prisma.outsideProgram.findFirst({
        where: { id: p.outsideProgramId, deletedAt: null },
        select: {
          name: true,
          programType: true,
          state: true,
          sessions: {
            where: sessionRange ? { sessionDate: sessionRange } : undefined,
            select: { id: true },
          },
        },
      });
      if (!program) throw new NotFoundException('Outside program not found');
      // Chapter scoping (§7.2): the program carries its own chapter column.
      assertChapterAccess(user.chapter, program.state);

      const sessionIds = new Set(program.sessions.map((s) => s.id));
      const enrollments = await this.prisma.outsideProgramEnrollment.findMany({
        where: { outsideProgramId: p.outsideProgramId, deletedAt: null },
        orderBy: { enrollmentDate: 'asc' },
        select: {
          status: true,
          participantProfile: {
            select: {
              participantNumber: true,
              person: { select: { firstName: true, lastName: true } },
            },
          },
          attendance: { select: { sessionId: true, status: true } },
        },
      });

      const sessionsHeld = sessionIds.size;
      return {
        columns: [
          { key: 'program', label: 'Program' },
          { key: 'programType', label: 'Program Type' },
          { key: 'participantNumber', label: 'Participant ID' },
          { key: 'name', label: 'Name' },
          { key: 'enrollmentStatus', label: 'Enrollment Status' },
          { key: 'sessionsHeld', label: 'Sessions Held' },
          { key: 'present', label: 'Present' },
          { key: 'late', label: 'Late' },
          { key: 'absent', label: 'Absent' },
          { key: 'excused', label: 'Excused' },
          { key: 'notMarked', label: 'Not Marked' },
          { key: 'attendanceRate', label: 'Attendance %' },
        ],
        rows: enrollments.map((e) => {
          const t = ReportsService.tallyAttendance(
            e.attendance.filter((a) => sessionIds.has(a.sessionId)).map((a) => a.status),
          );
          return {
            program: program.name,
            programType: program.programType,
            participantNumber: e.participantProfile.participantNumber,
            name: personName(e.participantProfile.person),
            enrollmentStatus: e.status,
            sessionsHeld,
            present: t.present,
            late: t.late,
            absent: t.absent,
            excused: t.excused,
            notMarked: Math.max(0, sessionsHeld - t.marked),
            attendanceRate: t.rate,
          };
        }),
      };
    }

    const programs = await this.prisma.outsideProgram.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): the program's own chapter column.
        ...(p.state ? { state: p.state } : {}),
        ...(p.programType ? { programType: p.programType } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        name: true,
        programType: true,
        status: true,
        _count: { select: { enrollments: { where: { deletedAt: null } } } },
        sessions: {
          where: sessionRange ? { sessionDate: sessionRange } : undefined,
          // Withdrawn (soft-deleted) enrollments' marks are excluded so the
          // summary tallies agree with the roster count beside them and with
          // the per-participant drill-down, which queries live enrollments.
          select: {
            attendance: {
              where: { enrollment: { deletedAt: null } },
              select: { status: true },
            },
          },
        },
      },
    });

    return {
      columns: [
        { key: 'program', label: 'Program' },
        { key: 'programType', label: 'Program Type' },
        { key: 'programStatus', label: 'Program Status' },
        { key: 'roster', label: 'Roster' },
        { key: 'sessionsHeld', label: 'Sessions Held' },
        { key: 'present', label: 'Present' },
        { key: 'late', label: 'Late' },
        { key: 'absent', label: 'Absent' },
        { key: 'excused', label: 'Excused' },
        { key: 'attendanceRate', label: 'Attendance %' },
      ],
      rows: programs.map((c) => {
        const t = ReportsService.tallyAttendance(
          c.sessions.flatMap((s) => s.attendance.map((a) => a.status)),
        );
        return {
          program: c.name,
          programType: c.programType,
          programStatus: c.status,
          roster: c._count.enrollments,
          sessionsHeld: c.sessions.length,
          present: t.present,
          late: t.late,
          absent: t.absent,
          excused: t.excused,
          attendanceRate: t.rate,
        };
      }),
    };
  }

  private async insideClassCompletions(p: ReportParams): Promise<ReportResult> {
    const range = dateRange(p.from, p.to);
    const classes = await this.prisma.insideClass.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): a class's chapter is its institution's state.
        ...(p.state ? { institution: { state: p.state } } : {}),
        ...(p.institutionId ? { institutionId: p.institutionId } : {}),
      },
      orderBy: [{ startDate: 'desc' }],
      select: {
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        institution: { select: { name: true, state: true } },
        enrollments: {
          where: { deletedAt: null },
          select: {
            completionStatus: true,
            completionDate: true,
            leftEarlyDate: true,
            finalAssessment: true,
          },
        },
      },
    });
    // Period filtering applies to the OUTCOME date (completion / left-early),
    // not to when the class ran.
    const within = (d: Date | null) =>
      !range || (d !== null && (!range.gte || d >= range.gte) && (!range.lte || d <= range.lte));
    return {
      columns: [
        { key: 'institution', label: 'Institution' },
        { key: 'state', label: 'State' },
        { key: 'className', label: 'Class' },
        { key: 'classStatus', label: 'Class Status' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'endDate', label: 'End Date' },
        { key: 'enrolled', label: 'Enrolled' },
        { key: 'completed', label: 'Completed' },
        { key: 'leftEarly', label: 'Left Early' },
        { key: 'blue', label: 'Blue' },
        { key: 'green', label: 'Green' },
        { key: 'yellow', label: 'Yellow' },
        { key: 'red', label: 'Red' },
      ],
      rows: classes.map((c) => {
        const completed = c.enrollments.filter(
          (e) => e.completionStatus === 'completed' && within(e.completionDate),
        );
        const leftEarly = c.enrollments.filter(
          (e) => e.completionStatus === 'left_early' && within(e.leftEarlyDate),
        );
        const dist = { blue: 0, green: 0, yellow: 0, red: 0 };
        for (const e of completed) if (e.finalAssessment) dist[e.finalAssessment] += 1;
        return {
          institution: c.institution.name,
          state: c.institution.state,
          className: c.name,
          classStatus: c.status,
          startDate: fmtDate(c.startDate),
          endDate: fmtDate(c.endDate),
          enrolled: c.enrollments.length,
          completed: completed.length,
          leftEarly: leftEarly.length,
          ...dist,
        };
      }),
    };
  }

  private async institutionActivity(p: ReportParams): Promise<ReportResult> {
    const [institutions, activeClasses, served] = await Promise.all([
      this.prisma.institution.findMany({
        where: { deletedAt: null, ...(p.state ? { state: p.state } : {}) },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          state: true,
          city: true,
          active: true,
          _count: {
            select: {
              insideClasses: { where: { deletedAt: null } },
              // Chapter scoping (§7.2): count only assignments whose volunteer
              // is in the viewer's chapter, matching every other subquery.
              volunteerAssignments: {
                where: {
                  deletedAt: null,
                  status: 'active',
                  ...(p.state ? { volunteerProfile: { chapterState: p.state } } : {}),
                },
              },
            },
          },
        },
      }),
      this.prisma.insideClass.groupBy({
        by: ['institutionId'],
        where: {
          deletedAt: null,
          status: 'active',
          ...(p.state ? { institution: { state: p.state } } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.insideClassEnrollment.findMany({
        where: {
          deletedAt: null,
          insideClass: { deletedAt: null, ...(p.state ? { institution: { state: p.state } } : {}) },
        },
        select: { participantProfileId: true, insideClass: { select: { institutionId: true } } },
      }),
    ]);
    const activeByInst = new Map(activeClasses.map((c) => [c.institutionId, c._count._all]));
    const servedByInst = new Map<string, Set<string>>();
    for (const e of served) {
      const set = servedByInst.get(e.insideClass.institutionId) ?? new Set<string>();
      set.add(e.participantProfileId);
      servedByInst.set(e.insideClass.institutionId, set);
    }
    return {
      columns: [
        { key: 'institution', label: 'Institution' },
        { key: 'state', label: 'State' },
        { key: 'city', label: 'City' },
        { key: 'active', label: 'Active' },
        { key: 'totalClasses', label: 'Total Classes' },
        { key: 'activeClasses', label: 'Active Classes' },
        { key: 'participantsServed', label: 'Participants Served' },
        { key: 'activeVolunteerAssignments', label: 'Active Volunteer Assignments' },
      ],
      rows: institutions.map((i) => ({
        institution: i.name,
        state: i.state,
        city: i.city ?? null,
        active: i.active,
        totalClasses: i._count.insideClasses,
        activeClasses: activeByInst.get(i.id) ?? 0,
        participantsServed: servedByInst.get(i.id)?.size ?? 0,
        activeVolunteerAssignments: i._count.volunteerAssignments,
      })),
    };
  }

  // ── Outside programming & housing ─────────────────────────────────────────

  private async outsideProgramEnrollment(p: ReportParams): Promise<ReportResult> {
    const status = this.validateEnum(p.status, ENROLLMENT_STATUSES, 'status') as
      | EnrollmentStatus
      | undefined;
    const rows = await this.prisma.outsideProgramEnrollment.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
        // Chapter scoping (§7.2): enrollments inherit the program's chapter.
        ...(p.programType || p.state
          ? {
              outsideProgram: {
                ...(p.programType ? { programType: p.programType } : {}),
                ...(p.state ? { state: p.state } : {}),
              },
            }
          : {}),
      },
      orderBy: { enrollmentDate: 'desc' },
      select: {
        enrollmentDate: true,
        status: true,
        completionDate: true,
        completionAssessment: true,
        outsideProgram: { select: { name: true, programType: true, state: true } },
        participantProfile: {
          select: {
            participantNumber: true,
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return {
      columns: [
        { key: 'participantNumber', label: 'Participant ID' },
        { key: 'name', label: 'Name' },
        { key: 'program', label: 'Program' },
        { key: 'programType', label: 'Program Type' },
        { key: 'state', label: 'State' },
        { key: 'enrollmentDate', label: 'Enrollment Date' },
        { key: 'status', label: 'Status' },
        { key: 'completionDate', label: 'Completion Date' },
        { key: 'completionAssessment', label: 'Assessment' },
      ],
      rows: rows.map((r) => ({
        participantNumber: r.participantProfile.participantNumber,
        name: personName(r.participantProfile.person),
        program: r.outsideProgram.name,
        programType: r.outsideProgram.programType,
        state: r.outsideProgram.state ?? null,
        enrollmentDate: fmtDate(r.enrollmentDate),
        status: r.status,
        completionDate: fmtDate(r.completionDate),
        completionAssessment: r.completionAssessment ?? null,
      })),
    };
  }

  private async housingOccupancy(p: ReportParams): Promise<ReportResult> {
    const homes = await this.prisma.transitionalHome.findMany({
      where: { deletedAt: null, ...(p.state ? { state: p.state } : {}) },
      orderBy: { name: 'asc' },
      select: {
        name: true,
        city: true,
        state: true,
        capacity: true,
        active: true,
        _count: { select: { enrollments: { where: { deletedAt: null, status: 'active' } } } },
      },
    });
    return {
      columns: [
        { key: 'home', label: 'Home' },
        { key: 'city', label: 'City' },
        { key: 'state', label: 'State' },
        { key: 'active', label: 'Active' },
        { key: 'capacity', label: 'Capacity' },
        { key: 'currentResidents', label: 'Current Residents' },
        { key: 'openBeds', label: 'Open Beds' },
        { key: 'occupancyPct', label: 'Occupancy %' },
      ],
      rows: homes.map((h) => ({
        home: h.name,
        city: h.city ?? null,
        state: h.state,
        active: h.active,
        capacity: h.capacity,
        currentResidents: h._count.enrollments,
        openBeds: h.capacity - h._count.enrollments,
        occupancyPct: h.capacity > 0 ? Math.round((h._count.enrollments / h.capacity) * 100) : null,
      })),
    };
  }

  private async housingExits(p: ReportParams): Promise<ReportResult> {
    const range = dateRange(p.from, p.to);
    const rows = await this.prisma.housingEnrollment.findMany({
      where: {
        deletedAt: null,
        status: { in: [...HOUSING_EXIT_STATUSES] },
        moveOutDate: range ?? { not: null },
        // Chapter scoping (§7.2): enrollments inherit the home's chapter.
        ...(p.state ? { home: { state: p.state } } : {}),
      },
      orderBy: { moveOutDate: 'desc' },
      select: {
        moveInDate: true,
        moveOutDate: true,
        status: true,
        reasonForLeaving: true,
        completionAssessment: true,
        home: { select: { name: true, state: true } },
        participantProfile: {
          select: {
            participantNumber: true,
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return {
      columns: [
        { key: 'participantNumber', label: 'Participant ID' },
        { key: 'name', label: 'Name' },
        { key: 'home', label: 'Home' },
        { key: 'state', label: 'State' },
        { key: 'moveInDate', label: 'Move-In Date' },
        { key: 'moveOutDate', label: 'Move-Out Date' },
        { key: 'status', label: 'Status' },
        { key: 'reasonForLeaving', label: 'Reason For Leaving' },
        { key: 'completionAssessment', label: 'Assessment' },
      ],
      rows: rows.map((r) => ({
        participantNumber: r.participantProfile.participantNumber,
        name: personName(r.participantProfile.person),
        home: r.home.name,
        state: r.home.state,
        moveInDate: fmtDate(r.moveInDate),
        moveOutDate: fmtDate(r.moveOutDate),
        status: r.status,
        reasonForLeaving: r.reasonForLeaving ?? null,
        completionAssessment: r.completionAssessment ?? null,
      })),
    };
  }

  // ── Case management ───────────────────────────────────────────────────────

  private async caseActivity(p: ReportParams): Promise<ReportResult> {
    // §7.3: case-activity reporting is COUNTS ONLY. This method never selects
    // note content, categories, or participant identities — confidential note
    // bodies are excluded from every report and export by design. The report
    // answers "how much activity happened", never "what was written".
    const range = dateRange(p.from, p.to);
    const [notes, services] = await Promise.all([
      this.prisma.caseNote.groupBy({
        by: ['caseManagerId', 'confidential'],
        where: {
          deletedAt: null,
          ...(p.caseManagerId ? { caseManagerId: p.caseManagerId } : {}),
          ...(range ? { noteDate: range } : {}),
          // Chapter scoping (§7.2): notes inherit the participant's chapter.
          ...(p.state ? { participantProfile: { chapterState: p.state } } : {}),
        },
        _count: { _all: true },
      }),
      // Services carry no author FK — they are attributed to the participant's
      // currently assigned case manager for this rollup.
      this.prisma.caseService.findMany({
        where: {
          deletedAt: null,
          ...(range ? { serviceDate: range } : {}),
          // Chapter scoping (§7.2): services inherit the participant's chapter.
          ...(p.caseManagerId || p.state
            ? {
                participantProfile: {
                  ...(p.caseManagerId ? { assignedCaseManagerId: p.caseManagerId } : {}),
                  ...(p.state ? { chapterState: p.state } : {}),
                },
              }
            : {}),
        },
        select: { participantProfile: { select: { assignedCaseManagerId: true } } },
      }),
    ]);

    const byManager = new Map<
      string,
      { notes: number; confidentialNotes: number; services: number }
    >();
    const bucket = (id: string) => {
      let b = byManager.get(id);
      if (!b) {
        b = { notes: 0, confidentialNotes: 0, services: 0 };
        byManager.set(id, b);
      }
      return b;
    };
    for (const n of notes) {
      const b = bucket(n.caseManagerId);
      b.notes += n._count._all;
      if (n.confidential) b.confidentialNotes += n._count._all;
    }
    for (const s of services) {
      bucket(s.participantProfile.assignedCaseManagerId ?? UNASSIGNED).services += 1;
    }

    const ids = [...byManager.keys()].filter((id) => id !== UNASSIGNED);
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, personName(u)]));

    return {
      columns: [
        { key: 'caseManager', label: 'Case Manager' },
        { key: 'noteCount', label: 'Case Notes' },
        { key: 'confidentialNoteCount', label: 'Confidential Notes (count only)' },
        { key: 'serviceCount', label: 'Services' },
        { key: 'total', label: 'Total Activity' },
      ],
      rows: [...byManager.entries()]
        .map(([id, b]) => ({
          caseManager: id === UNASSIGNED ? 'Unassigned' : (names.get(id) ?? 'Unknown user'),
          noteCount: b.notes,
          confidentialNoteCount: b.confidentialNotes,
          serviceCount: b.services,
          total: b.notes + b.services,
        }))
        .sort((a, b) => a.caseManager.localeCompare(b.caseManager)),
    };
  }

  // ── Volunteers ────────────────────────────────────────────────────────────

  private async volunteerAssignments(p: ReportParams): Promise<ReportResult> {
    const rows = await this.prisma.volunteerAssignment.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): assignments inherit the volunteer's chapter.
        ...(p.state ? { volunteerProfile: { chapterState: p.state } } : {}),
        ...(p.institutionId ? { institutionId: p.institutionId } : {}),
        ...(p.assignmentType ? { assignmentType: p.assignmentType } : {}),
      },
      orderBy: { startDate: 'desc' },
      select: {
        assignmentType: true,
        role: true,
        startDate: true,
        endDate: true,
        status: true,
        volunteerProfile: {
          select: { status: true, person: { select: { firstName: true, lastName: true } } },
        },
        institution: { select: { name: true } },
        insideClass: { select: { name: true } },
        outsideProgram: { select: { name: true } },
        event: { select: { name: true } },
      },
    });
    return {
      columns: [
        { key: 'volunteer', label: 'Volunteer' },
        { key: 'volunteerStatus', label: 'Volunteer Status' },
        { key: 'assignmentType', label: 'Assignment Type' },
        { key: 'role', label: 'Role' },
        { key: 'institution', label: 'Institution' },
        { key: 'insideClass', label: 'Inside Class' },
        { key: 'outsideProgram', label: 'Outside Program' },
        { key: 'event', label: 'Event' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'endDate', label: 'End Date' },
        { key: 'status', label: 'Status' },
      ],
      rows: rows.map((r) => ({
        volunteer: personName(r.volunteerProfile.person),
        volunteerStatus: r.volunteerProfile.status,
        assignmentType: r.assignmentType,
        role: r.role ?? null,
        institution: r.institution?.name ?? null,
        insideClass: r.insideClass?.name ?? null,
        outsideProgram: r.outsideProgram?.name ?? null,
        event: r.event?.name ?? null,
        startDate: fmtDate(r.startDate),
        endDate: fmtDate(r.endDate),
        status: r.status,
      })),
    };
  }

  private async volunteerTrainings(p: ReportParams): Promise<ReportResult> {
    const today = startOfUtcDay(new Date());
    const rows = await this.prisma.volunteerTraining.findMany({
      where: {
        // Chapter scoping (§7.2): trainings inherit the volunteer's chapter.
        ...(p.state ? { volunteerProfile: { chapterState: p.state } } : {}),
        ...(p.expiringWithinDays
          ? { expiresAt: { lte: addDays(today, p.expiringWithinDays) } }
          : {}),
      },
      orderBy: [{ expiresAt: 'asc' }],
      select: {
        trainingType: true,
        completedAt: true,
        expiresAt: true,
        volunteerProfile: {
          select: { status: true, person: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    return {
      columns: [
        { key: 'volunteer', label: 'Volunteer' },
        { key: 'volunteerStatus', label: 'Volunteer Status' },
        { key: 'trainingType', label: 'Training' },
        { key: 'completedAt', label: 'Completed' },
        { key: 'expiresAt', label: 'Expires' },
        { key: 'expired', label: 'Expired' },
      ],
      rows: rows.map((r) => ({
        volunteer: personName(r.volunteerProfile.person),
        volunteerStatus: r.volunteerProfile.status,
        trainingType: r.trainingType,
        completedAt: fmtDate(r.completedAt),
        expiresAt: fmtDate(r.expiresAt),
        expired: r.expiresAt !== null && r.expiresAt < today,
      })),
    };
  }

  /** Approved service hours rolled up per volunteer. */
  private async volunteerHours(p: ReportParams): Promise<ReportResult> {
    const range = dateRange(p.from, p.to);
    const entries = await this.prisma.volunteerHoursEntry.findMany({
      where: {
        deletedAt: null,
        status: 'approved',
        // Chapter scoping (§7.2): hours inherit the volunteer's chapter.
        ...(p.state ? { volunteerProfile: { chapterState: p.state } } : {}),
        ...(range ? { activityDate: range } : {}),
        ...(p.opportunityId ? { opportunityId: p.opportunityId } : {}),
      },
      select: {
        hours: true,
        activityDate: true,
        opportunityId: true,
        volunteerProfile: {
          select: { id: true, person: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    interface Rollup {
      volunteer: string;
      hours: number;
      entries: number;
      opportunities: Set<string>;
      firstDate: Date;
      lastDate: Date;
    }
    const byVolunteer = new Map<string, Rollup>();
    for (const e of entries) {
      let r = byVolunteer.get(e.volunteerProfile.id);
      if (!r) {
        r = {
          volunteer: personName(e.volunteerProfile.person),
          hours: 0,
          entries: 0,
          opportunities: new Set<string>(),
          firstDate: e.activityDate,
          lastDate: e.activityDate,
        };
        byVolunteer.set(e.volunteerProfile.id, r);
      }
      r.hours += Number(e.hours);
      r.entries += 1;
      if (e.opportunityId) r.opportunities.add(e.opportunityId);
      if (e.activityDate < r.firstDate) r.firstDate = e.activityDate;
      if (e.activityDate > r.lastDate) r.lastDate = e.activityDate;
    }

    return {
      columns: [
        { key: 'volunteer', label: 'Volunteer' },
        { key: 'hours', label: 'Approved Hours' },
        { key: 'entries', label: 'Entries' },
        { key: 'opportunities', label: 'Opportunities' },
        { key: 'firstDate', label: 'First Activity' },
        { key: 'lastDate', label: 'Last Activity' },
      ],
      rows: [...byVolunteer.values()]
        .sort((a, b) => a.volunteer.localeCompare(b.volunteer))
        .map((r) => ({
          volunteer: r.volunteer,
          hours: Math.round(r.hours * 100) / 100,
          entries: r.entries,
          opportunities: r.opportunities.size,
          firstDate: fmtDate(r.firstDate),
          lastDate: fmtDate(r.lastDate),
        })),
    };
  }

  // ── Development (native donor management §6.8) ────────────────────────────

  private async donorGiving(p: ReportParams): Promise<ReportResult> {
    const range = dateRange(p.from, p.to);
    const rows = await this.prisma.donation.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): donations inherit the donor's chapter.
        ...(p.state ? { donor: { chapterState: p.state } } : {}),
        ...(range ? { donationDate: range } : {}),
        ...(p.campaignId ? { campaignId: p.campaignId } : {}),
      },
      orderBy: { donationDate: 'desc' },
      select: {
        donationDate: true,
        amount: true,
        fund: { select: { name: true } },
        paymentMethod: true,
        isRecurring: true,
        donor: { select: { name: true, donorType: true } },
        campaign: { select: { name: true } },
        event: { select: { name: true } },
      },
    });
    return {
      columns: [
        { key: 'donor', label: 'Donor' },
        { key: 'donorType', label: 'Donor Type' },
        { key: 'donationDate', label: 'Date' },
        { key: 'amount', label: 'Amount' },
        { key: 'fund', label: 'Fund' },
        { key: 'paymentMethod', label: 'Payment Method' },
        { key: 'isRecurring', label: 'Recurring' },
        { key: 'campaign', label: 'Campaign' },
        { key: 'event', label: 'Event' },
      ],
      rows: rows.map((r) => ({
        donor: r.donor.name,
        donorType: r.donor.donorType,
        donationDate: fmtDate(r.donationDate),
        amount: num(r.amount),
        fund: r.fund?.name ?? null,
        paymentMethod: r.paymentMethod ?? null,
        isRecurring: r.isRecurring,
        campaign: r.campaign?.name ?? null,
        event: r.event?.name ?? null,
      })),
    };
  }

  private async pledgeStatus(p: ReportParams): Promise<ReportResult> {
    const status = this.validateEnum(p.status, PLEDGE_STATUSES, 'status') as
      | PledgeStatus
      | undefined;
    const pledges = await this.prisma.pledge.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): pledges inherit the donor's chapter.
        ...(p.state ? { donor: { chapterState: p.state } } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { pledgeDate: 'desc' },
      select: {
        id: true,
        pledgeDate: true,
        totalAmount: true,
        installmentAmount: true,
        frequency: true,
        startDate: true,
        writtenOffAmount: true,
        status: true,
        donor: { select: { name: true } },
      },
    });
    // Paid/balance/arrears are computed from payments — never stored.
    const paid = pledges.length
      ? await this.prisma.donation.groupBy({
          by: ['pledgeId'],
          where: { deletedAt: null, pledgeId: { in: pledges.map((pl) => pl.id) } },
          _sum: { amount: true },
        })
      : [];
    const paidByPledge = new Map(paid.map((s) => [s.pledgeId, num(s._sum.amount) ?? 0]));
    const today = new Date();
    return {
      columns: [
        { key: 'donor', label: 'Donor' },
        { key: 'pledgeDate', label: 'Pledge Date' },
        { key: 'totalAmount', label: 'Total Pledged' },
        { key: 'paid', label: 'Paid' },
        { key: 'balance', label: 'Balance' },
        { key: 'status', label: 'Status' },
        { key: 'inArrears', label: 'In Arrears' },
      ],
      rows: pledges.map((pl) => {
        const computed = pledgeComputed(pl, paidByPledge.get(pl.id) ?? 0, today);
        return {
          donor: pl.donor.name,
          pledgeDate: fmtDate(pl.pledgeDate),
          totalAmount: num(pl.totalAmount),
          paid: computed.amountPaid,
          balance: computed.balance,
          status: pl.status,
          inArrears: computed.inArrears,
        };
      }),
    };
  }

  private async recurringGifts(p: ReportParams): Promise<ReportResult> {
    const status = this.validateEnum(p.status, RECURRING_GIFT_STATUSES, 'status') as
      | RecurringGiftStatus
      | undefined;
    const gifts = await this.prisma.recurringGift.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): recurring gifts inherit the donor's chapter.
        ...(p.state ? { donor: { chapterState: p.state } } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        amount: true,
        frequency: true,
        startDate: true,
        nextGiftDate: true,
        status: true,
        donor: { select: { name: true } },
      },
    });
    const payments = gifts.length
      ? await this.prisma.donation.groupBy({
          by: ['recurringGiftId'],
          where: { deletedAt: null, recurringGiftId: { in: gifts.map((g) => g.id) } },
          _sum: { amount: true },
          _max: { donationDate: true },
        })
      : [];
    const byGift = new Map(payments.map((s) => [s.recurringGiftId, s]));
    return {
      columns: [
        { key: 'donor', label: 'Donor' },
        { key: 'amount', label: 'Amount' },
        { key: 'frequency', label: 'Frequency' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'nextGiftDate', label: 'Next Gift' },
        { key: 'lastPaymentDate', label: 'Last Payment' },
        { key: 'totalGiven', label: 'Total Given' },
        { key: 'status', label: 'Status' },
      ],
      rows: gifts.map((g) => ({
        donor: g.donor.name,
        amount: num(g.amount),
        frequency: g.frequency,
        startDate: fmtDate(g.startDate),
        nextGiftDate: fmtDate(g.nextGiftDate),
        lastPaymentDate: fmtDate(byGift.get(g.id)?._max.donationDate),
        totalGiven: num(byGift.get(g.id)?._sum.amount) ?? 0,
        status: g.status,
      })),
    };
  }

  /** Year-end statement data — one row per donor with any gift that year. */
  private async givingStatements(p: ReportParams): Promise<ReportResult> {
    const year = p.year ?? new Date().getUTCFullYear();
    const donations = await this.prisma.donation.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): statements cover the donor's chapter only.
        ...(p.state ? { donor: { chapterState: p.state } } : {}),
        donationDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lte: new Date(Date.UTC(year, 11, 31)),
        },
      },
      select: {
        amount: true,
        nonDeductibleAmount: true,
        donor: {
          select: {
            id: true,
            name: true,
            addressLine1: true,
            city: true,
            state: true,
            zip: true,
            mailingSameAsPrimary: true,
            mailingAddressLine1: true,
            mailingCity: true,
            mailingState: true,
            mailingZip: true,
          },
        },
      },
    });

    interface Statement {
      donor: string;
      address: string | null;
      giftCount: number;
      totalAmount: number;
      totalDeductible: number;
      largestGift: number;
    }
    const byDonor = new Map<string, Statement>();
    for (const d of donations) {
      let s = byDonor.get(d.donor.id);
      if (!s) {
        // Statements are MAILED — address them like letters do (§ mailing.util).
        const to = effectiveMailingAddress(d.donor);
        const cityLine = [to.city, [to.state, to.zip].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ');
        const address = [to.addressLine1, cityLine].filter(Boolean).join(', ');
        s = {
          donor: d.donor.name,
          address: address || null,
          giftCount: 0,
          totalAmount: 0,
          totalDeductible: 0,
          largestGift: 0,
        };
        byDonor.set(d.donor.id, s);
      }
      const amount = Number(d.amount);
      s.giftCount += 1;
      s.totalAmount += amount;
      s.totalDeductible += amount - Number(d.nonDeductibleAmount ?? 0);
      s.largestGift = Math.max(s.largestGift, amount);
    }

    const round2 = (v: number) => Math.round(v * 100) / 100;
    return {
      columns: [
        { key: 'donor', label: 'Donor' },
        { key: 'address', label: 'Address' },
        { key: 'giftCount', label: 'Gifts' },
        { key: 'totalAmount', label: 'Total Given' },
        { key: 'totalDeductible', label: 'Tax-Deductible' },
        { key: 'largestGift', label: 'Largest Gift' },
      ],
      rows: [...byDonor.values()]
        .sort((a, b) => a.donor.localeCompare(b.donor))
        .map((s) => ({
          ...s,
          totalAmount: round2(s.totalAmount),
          totalDeductible: round2(s.totalDeductible),
          largestGift: round2(s.largestGift),
        })),
    };
  }

  private async campaignPerformance(p: ReportParams): Promise<ReportResult> {
    const campaigns = await this.prisma.campaign.findMany({
      // Chapter scoping (§7.2): campaigns carry their own chapter column.
      where: { deletedAt: null, ...(p.state ? { chapterState: p.state } : {}) },
      orderBy: [{ startDate: 'desc' }],
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        goalAmount: true,
      },
    });
    const ids = campaigns.map((c) => c.id);
    // Raised amounts are computed from donations — no second source of
    // truth (§6.8).
    const sums = ids.length
      ? await this.prisma.donation.groupBy({
          by: ['campaignId'],
          where: { deletedAt: null, campaignId: { in: ids } },
          _sum: { amount: true },
          _count: { _all: true },
        })
      : [];
    const donorPairs = ids.length
      ? await this.prisma.donation.findMany({
          where: { deletedAt: null, campaignId: { in: ids } },
          distinct: ['campaignId', 'donorId'],
          select: { campaignId: true, donorId: true },
        })
      : [];
    const raised = new Map(
      sums.map((s) => [
        s.campaignId,
        { total: s._sum.amount ? Number(s._sum.amount) : 0, count: s._count._all },
      ]),
    );
    const donorCounts = new Map<string, number>();
    for (const d of donorPairs) {
      if (d.campaignId) donorCounts.set(d.campaignId, (donorCounts.get(d.campaignId) ?? 0) + 1);
    }
    return {
      columns: [
        { key: 'campaign', label: 'Campaign' },
        { key: 'status', label: 'Status' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'endDate', label: 'End Date' },
        { key: 'goalAmount', label: 'Goal' },
        { key: 'raisedToDate', label: 'Raised To Date' },
        { key: 'donationCount', label: 'Donations' },
        { key: 'donorCount', label: 'Distinct Donors' },
        { key: 'pctOfGoal', label: '% of Goal' },
      ],
      rows: campaigns.map((c) => {
        const r = raised.get(c.id) ?? { total: 0, count: 0 };
        const goal = num(c.goalAmount);
        return {
          campaign: c.name,
          status: c.status,
          startDate: fmtDate(c.startDate),
          endDate: fmtDate(c.endDate),
          goalAmount: goal,
          raisedToDate: r.total,
          donationCount: r.count,
          donorCount: donorCounts.get(c.id) ?? 0,
          pctOfGoal: goal && goal > 0 ? Math.round((r.total / goal) * 100) : null,
        };
      }),
    };
  }

  private async eventFinancials(p: ReportParams): Promise<ReportResult> {
    const range = dateRange(p.from, p.to);
    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): events carry their own chapter column.
        ...(p.state ? { chapterState: p.state } : {}),
        ...(range ? { eventDate: range } : {}),
      },
      orderBy: { eventDate: 'desc' },
      select: {
        id: true,
        name: true,
        eventType: true,
        eventDate: true,
        location: true,
        attendanceCount: true,
        revenue: true,
        expenses: true,
      },
    });
    const sums = events.length
      ? await this.prisma.donation.groupBy({
          by: ['eventId'],
          where: { deletedAt: null, eventId: { in: events.map((e) => e.id) } },
          _sum: { amount: true },
        })
      : [];
    const linked = new Map(
      sums.map((s) => [s.eventId, s._sum.amount ? Number(s._sum.amount) : 0]),
    );
    return {
      columns: [
        { key: 'event', label: 'Event' },
        { key: 'eventType', label: 'Type' },
        { key: 'eventDate', label: 'Date' },
        { key: 'location', label: 'Location' },
        { key: 'attendanceCount', label: 'Attendance' },
        { key: 'revenue', label: 'Revenue' },
        { key: 'expenses', label: 'Expenses' },
        { key: 'net', label: 'Net' },
        { key: 'linkedDonations', label: 'Linked Donations' },
      ],
      rows: events.map((e) => ({
        event: e.name,
        eventType: e.eventType ?? null,
        eventDate: fmtDate(e.eventDate),
        location: e.location ?? null,
        attendanceCount: e.attendanceCount ?? null,
        revenue: num(e.revenue),
        expenses: num(e.expenses),
        net:
          e.revenue === null && e.expenses === null
            ? null
            : Number(e.revenue ?? 0) - Number(e.expenses ?? 0),
        linkedDonations: linked.get(e.id) ?? 0,
      })),
    };
  }

  // ── Employment ────────────────────────────────────────────────────────────

  private async employerParticipation(p: ReportParams): Promise<ReportResult> {
    const [employers, employments] = await Promise.all([
      this.prisma.employer.findMany({
        // Chapter scoping (§7.2): employers carry their own chapter column
        // (postal `state` stays address data).
        where: { deletedAt: null, ...(p.state ? { chapterState: p.state } : {}) },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          industry: true,
          hiringStatus: true,
          city: true,
          state: true,
        },
      }),
      this.prisma.participantEmployment.findMany({
        where: {
          deletedAt: null,
          // Chapter scoping (§7.2): placements inherit the participant's chapter.
          ...(p.state ? { participantProfile: { chapterState: p.state } } : {}),
        },
        select: { employerId: true, status: true, participantProfileId: true },
      }),
    ]);
    const stats = new Map<string, { total: number; active: number; participants: Set<string> }>();
    for (const e of employments) {
      let s = stats.get(e.employerId);
      if (!s) {
        s = { total: 0, active: 0, participants: new Set() };
        stats.set(e.employerId, s);
      }
      s.total += 1;
      if (e.status === 'active') s.active += 1;
      s.participants.add(e.participantProfileId);
    }
    return {
      columns: [
        { key: 'employer', label: 'Employer' },
        { key: 'industry', label: 'Industry' },
        { key: 'hiringStatus', label: 'Hiring Status' },
        { key: 'city', label: 'City' },
        { key: 'state', label: 'State' },
        { key: 'totalPlacements', label: 'Total Placements' },
        { key: 'activePlacements', label: 'Active Placements' },
        { key: 'participantsServed', label: 'Participants Served' },
      ],
      rows: employers.map((e) => {
        const s = stats.get(e.id);
        return {
          employer: e.name,
          industry: e.industry ?? null,
          hiringStatus: e.hiringStatus,
          city: e.city ?? null,
          state: e.state ?? null,
          totalPlacements: s?.total ?? 0,
          activePlacements: s?.active ?? 0,
          participantsServed: s?.participants.size ?? 0,
        };
      }),
    };
  }

  private async employmentHistory(
    p: ReportParams,
    user: AuthenticatedUser,
  ): Promise<ReportResult> {
    const rows = await this.prisma.participantEmployment.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): employment inherits the participant's chapter.
        ...(p.state ? { participantProfile: { chapterState: p.state } } : {}),
        ...(p.participantProfileId ? { participantProfileId: p.participantProfileId } : {}),
        ...(p.employerId ? { employerId: p.employerId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        jobTitle: true,
        status: true,
        startDate: true,
        endDate: true,
        payRate: true,
        payPeriod: true,
        hoursPerWeek: true,
        supervisorName: true,
        employer: { select: { name: true } },
        participantProfile: {
          select: {
            participantNumber: true,
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    // §7.2 pay field class: pay columns exist only for holders of
    // fields.pay.read — dropped entirely (not blanked) otherwise.
    const showPay = hasPerm(user, 'fields.pay.read');
    return {
      columns: [
        { key: 'participantNumber', label: 'Participant ID' },
        { key: 'name', label: 'Name' },
        { key: 'employer', label: 'Employer' },
        { key: 'jobTitle', label: 'Job Title' },
        { key: 'status', label: 'Status' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'endDate', label: 'End Date' },
        ...(showPay
          ? [
              { key: 'payRate', label: 'Pay Rate' },
              { key: 'payPeriod', label: 'Pay Period' },
              { key: 'hoursPerWeek', label: 'Hours/Week' },
            ]
          : []),
        { key: 'supervisorName', label: 'Supervisor' },
      ],
      rows: rows.map((r) => ({
        participantNumber: r.participantProfile.participantNumber,
        name: personName(r.participantProfile.person),
        employer: r.employer.name,
        jobTitle: r.jobTitle,
        status: r.status,
        startDate: fmtDate(r.startDate),
        endDate: fmtDate(r.endDate),
        ...(showPay
          ? {
              payRate: num(r.payRate),
              payPeriod: r.payPeriod ?? null,
              hoursPerWeek: r.hoursPerWeek ?? null,
            }
          : {}),
        supervisorName: r.supervisorName ?? null,
      })),
    };
  }

  // ── Fleet ─────────────────────────────────────────────────────────────────

  private async vehicleMaintenance(p: ReportParams): Promise<ReportResult> {
    const range = dateRange(p.from, p.to);
    const rows = await this.prisma.vehicleMaintenanceRecord.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): records inherit the vehicle's chapter.
        ...(p.state ? { vehicle: { chapterState: p.state } } : {}),
        ...(p.vehicleId ? { vehicleId: p.vehicleId } : {}),
        ...(range ? { maintenanceDate: range } : {}),
      },
      orderBy: { maintenanceDate: 'desc' },
      select: {
        maintenanceDate: true,
        maintenanceType: true,
        mileageAtService: true,
        cost: true,
        description: true,
        nextServiceDueDate: true,
        nextServiceDueMileage: true,
        vehicle: { select: { year: true, make: true, model: true, licensePlate: true } },
        vendor: { select: { name: true } },
      },
    });
    return {
      columns: [
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'licensePlate', label: 'License Plate' },
        { key: 'maintenanceDate', label: 'Service Date' },
        { key: 'maintenanceType', label: 'Service Type' },
        { key: 'mileageAtService', label: 'Mileage' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'cost', label: 'Cost' },
        { key: 'description', label: 'Description' },
        { key: 'nextServiceDueDate', label: 'Next Service Due' },
        { key: 'nextServiceDueMileage', label: 'Next Service Mileage' },
      ],
      rows: rows.map((r) => ({
        vehicle: `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`,
        licensePlate: r.vehicle.licensePlate ?? null,
        maintenanceDate: fmtDate(r.maintenanceDate),
        maintenanceType: r.maintenanceType,
        mileageAtService: r.mileageAtService ?? null,
        vendor: r.vendor?.name ?? null,
        cost: num(r.cost),
        description: r.description ?? null,
        nextServiceDueDate: fmtDate(r.nextServiceDueDate),
        nextServiceDueMileage: r.nextServiceDueMileage ?? null,
      })),
    };
  }

  private async upcomingMaintenance(p: ReportParams): Promise<ReportResult> {
    // The LATEST record per active vehicle decides what is due — older records
    // are superseded by later service. Fixed 90-day horizon, overdue included.
    const today = startOfUtcDay(new Date());
    const horizon = addDays(today, 90);
    const latest = await this.prisma.vehicleMaintenanceRecord.findMany({
      where: {
        deletedAt: null,
        // Chapter scoping (§7.2): records inherit the vehicle's chapter.
        vehicle: {
          deletedAt: null,
          active: true,
          ...(p.state ? { chapterState: p.state } : {}),
        },
      },
      orderBy: { maintenanceDate: 'desc' },
      distinct: ['vehicleId'],
      select: {
        maintenanceDate: true,
        maintenanceType: true,
        nextServiceDueDate: true,
        nextServiceDueMileage: true,
        vehicle: {
          select: { year: true, make: true, model: true, licensePlate: true, mileage: true },
        },
      },
    });
    const due = latest
      .filter(
        (r): r is typeof r & { nextServiceDueDate: Date } =>
          r.nextServiceDueDate !== null && r.nextServiceDueDate <= horizon,
      )
      .sort((a, b) => a.nextServiceDueDate.getTime() - b.nextServiceDueDate.getTime());
    return {
      columns: [
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'licensePlate', label: 'License Plate' },
        { key: 'currentMileage', label: 'Current Mileage' },
        { key: 'lastServiceDate', label: 'Last Service' },
        { key: 'lastServiceType', label: 'Last Service Type' },
        { key: 'nextServiceDueDate', label: 'Next Service Due' },
        { key: 'nextServiceDueMileage', label: 'Next Service Mileage' },
        { key: 'overdue', label: 'Overdue' },
      ],
      rows: due.map((r) => ({
        vehicle: `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`,
        licensePlate: r.vehicle.licensePlate ?? null,
        currentMileage: r.vehicle.mileage ?? null,
        lastServiceDate: fmtDate(r.maintenanceDate),
        lastServiceType: r.maintenanceType,
        nextServiceDueDate: fmtDate(r.nextServiceDueDate),
        nextServiceDueMileage: r.nextServiceDueMileage ?? null,
        overdue: r.nextServiceDueDate < today,
      })),
    };
  }
}
