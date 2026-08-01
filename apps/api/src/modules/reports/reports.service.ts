import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import {
  ASSIGNMENT_TYPES,
  ENROLLMENT_STATUSES,
  HOUSING_EXIT_STATUSES,
  INSIDE_STATUSES,
  OUTSIDE_STATUSES,
  PROGRAM_TYPES,
  US_STATES,
  type AssignmentType,
  type EnrollmentStatus,
  type InsideStatus,
  type OutsideStatus,
  type PermissionKey,
  type ProgramType,
} from '@jumpstart/shared';
import { hasPerm, type AuthenticatedUser } from '../../common/types';
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
        { name: 'state', label: 'State', type: 'enum', values: US_STATES },
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
        { name: 'institutionId', label: 'Institution', type: 'uuid' },
        { name: 'from', label: 'From', type: 'date' },
        { name: 'to', label: 'To', type: 'date' },
      ],
      run: (p) => this.insideClassCompletions(p),
    },
    {
      key: 'institution-activity',
      name: 'Institution Activity',
      permission: 'institutions.read',
      params: [{ name: 'state', label: 'State', type: 'enum', values: US_STATES }],
      run: (p) => this.institutionActivity(p),
    },
    {
      key: 'outside-program-enrollment',
      name: 'Outside Program Enrollment',
      permission: 'outside_programs.read',
      params: [
        { name: 'programType', label: 'Program Type', type: 'enum', values: PROGRAM_TYPES },
        { name: 'status', label: 'Status', type: 'enum', values: ENROLLMENT_STATUSES },
      ],
      run: (p) => this.outsideProgramEnrollment(p),
    },
    {
      key: 'housing-occupancy',
      name: 'Transitional Housing Occupancy',
      permission: 'housing.read',
      params: [{ name: 'state', label: 'State', type: 'enum', values: US_STATES }],
      run: (p) => this.housingOccupancy(p),
    },
    {
      key: 'housing-exits',
      name: 'Housing Completions & Exits',
      permission: 'housing.read',
      params: [
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
        { name: 'institutionId', label: 'Institution', type: 'uuid' },
        { name: 'assignmentType', label: 'Assignment Type', type: 'enum', values: ASSIGNMENT_TYPES },
      ],
      run: (p) => this.volunteerAssignments(p),
    },
    {
      key: 'volunteer-trainings',
      name: 'Volunteer Trainings',
      permission: 'volunteers.read',
      params: [{ name: 'expiringWithinDays', label: 'Expiring Within (days)', type: 'number' }],
      run: (p) => this.volunteerTrainings(p),
    },
    {
      key: 'donor-giving',
      name: 'Donor Giving History',
      permission: 'donors.read',
      params: [
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
      params: [],
      run: () => this.campaignPerformance(),
    },
    {
      key: 'event-financials',
      name: 'Event Financial Summary',
      permission: 'events.read',
      params: [
        { name: 'from', label: 'From', type: 'date' },
        { name: 'to', label: 'To', type: 'date' },
      ],
      run: (p) => this.eventFinancials(p),
    },
    {
      key: 'employer-participation',
      name: 'Employer Participation',
      permission: 'employers.read',
      params: [],
      run: () => this.employerParticipation(),
    },
    {
      key: 'employment-history',
      name: 'Participant Employment History',
      permission: 'employment.read',
      params: [
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
      params: [],
      run: () => this.upcomingMaintenance(),
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
        // A participant's "state" is their current mailing-address state.
        ...(p.state ? { person: { state: p.state } } : {}),
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
      select: { name: true, institution: { select: { name: true } } },
    });
    if (!cls) throw new NotFoundException('Inside class not found');

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

  private async insideClassCompletions(p: ReportParams): Promise<ReportResult> {
    const range = dateRange(p.from, p.to);
    const classes = await this.prisma.insideClass.findMany({
      where: { deletedAt: null, ...(p.institutionId ? { institutionId: p.institutionId } : {}) },
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
              volunteerAssignments: { where: { deletedAt: null, status: 'active' } },
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
        ...(p.programType ? { outsideProgram: { programType: p.programType } } : {}),
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
        },
        _count: { _all: true },
      }),
      // Services carry no author FK — they are attributed to the participant's
      // currently assigned case manager for this rollup.
      this.prisma.caseService.findMany({
        where: {
          deletedAt: null,
          ...(range ? { serviceDate: range } : {}),
          ...(p.caseManagerId
            ? { participantProfile: { assignedCaseManagerId: p.caseManagerId } }
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
      where: p.expiringWithinDays
        ? { expiresAt: { lte: addDays(today, p.expiringWithinDays) } }
        : {},
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

  // ── Development (Bloomerang mirror §6.8) ──────────────────────────────────

  private async donorGiving(p: ReportParams): Promise<ReportResult> {
    const range = dateRange(p.from, p.to);
    const rows = await this.prisma.donation.findMany({
      where: {
        deletedAt: null,
        ...(range ? { donationDate: range } : {}),
        ...(p.campaignId ? { campaignId: p.campaignId } : {}),
      },
      orderBy: { donationDate: 'desc' },
      select: {
        donationDate: true,
        amount: true,
        fund: true,
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
        fund: r.fund ?? null,
        paymentMethod: r.paymentMethod ?? null,
        isRecurring: r.isRecurring,
        campaign: r.campaign?.name ?? null,
        event: r.event?.name ?? null,
      })),
    };
  }

  private async campaignPerformance(): Promise<ReportResult> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { deletedAt: null },
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
    // Raised amounts are computed from mirrored donations — no second source
    // of truth (§6.8).
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
      where: { deletedAt: null, ...(range ? { eventDate: range } : {}) },
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

  private async employerParticipation(): Promise<ReportResult> {
    const [employers, employments] = await Promise.all([
      this.prisma.employer.findMany({
        where: { deletedAt: null },
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
        where: { deletedAt: null },
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

  private async upcomingMaintenance(): Promise<ReportResult> {
    // The LATEST record per active vehicle decides what is due — older records
    // are superseded by later service. Fixed 90-day horizon, overdue included.
    const today = startOfUtcDay(new Date());
    const horizon = addDays(today, 90);
    const latest = await this.prisma.vehicleMaintenanceRecord.findMany({
      where: { deletedAt: null, vehicle: { deletedAt: null, active: true } },
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
