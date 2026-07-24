import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  ListQuery,
  MentorAssignmentEndInput,
  MentorAssignmentInput,
  MentorAssignmentPauseInput,
  MentorAssignmentStatus,
  MentorSessionLogInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface AssignmentListFilters {
  status?: MentorAssignmentStatus;
  mentorProfileId?: string;
  participantProfileId?: string;
}

const SORTABLE = new Set(['status', 'startDate', 'endDate', 'createdAt']);
const SESSION_SORTABLE = new Set(['sessionDate', 'createdAt']);

/** Configurable capacity, §6.7 workflow 4 — default max 2 active mentees. */
const MAX_MENTEES_SETTING = 'mentoring.maxActiveMentees';
const MAX_MENTEES_DEFAULT = 2;

// §6.7 access boundary: mentors are NOT users, and mentoring endpoints never
// expose a mentee's case data — participant name + participantNumber only.
const ASSIGNMENT_INCLUDE = {
  mentorProfile: {
    select: { id: true, person: { select: { firstName: true, lastName: true } } },
  },
  participantProfile: {
    select: {
      id: true,
      participantNumber: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

type AssignmentWithNames = Prisma.MentorAssignmentGetPayload<{
  include: typeof ASSIGNMENT_INCLUDE;
}>;

function toView(assignment: AssignmentWithNames) {
  const { mentorProfile, participantProfile, ...rest } = assignment;
  return {
    ...rest,
    mentorName: `${mentorProfile.person.firstName} ${mentorProfile.person.lastName}`,
    participantName: `${participantProfile.person.firstName} ${participantProfile.person.lastName}`,
    participantNumber: participantProfile.participantNumber,
  };
}

/** @db.Date columns come back as UTC midnight — compare against the same. */
function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysAgo(days: number): Date {
  const d = utcToday();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

@Injectable()
export class MentorAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async maxActiveMentees(): Promise<number> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: MAX_MENTEES_SETTING },
    });
    const n = Number(setting?.value);
    return Number.isInteger(n) && n > 0 ? n : MAX_MENTEES_DEFAULT;
  }

  private async assertMentorHasCapacity(mentorProfileId: string, excludeAssignmentId?: string) {
    const max = await this.maxActiveMentees();
    const active = await this.prisma.mentorAssignment.count({
      where: {
        mentorProfileId,
        status: 'active',
        deletedAt: null,
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      },
    });
    if (active >= max) {
      throw new ConflictException(
        `This mentor already has ${active} active mentee${active === 1 ? '' : 's'} (maximum ${max})`,
      );
    }
  }

  /**
   * Propose a match (§6.7 workflow 4). Assignments always start as 'proposed':
   * activation is the case manager's approval and has its own endpoint.
   */
  async create(input: MentorAssignmentInput, userId: string) {
    if (input.status !== 'proposed') {
      throw new BadRequestException(
        'Assignments start as proposed — activation requires case-manager approval',
      );
    }

    const mentor = await this.prisma.volunteerProfile.findFirst({
      where: { id: input.mentorProfileId, deletedAt: null },
    });
    if (!mentor) throw new BadRequestException('Mentor volunteer profile not found');
    if (!mentor.isMentor) {
      throw new BadRequestException(
        'This volunteer has not been approved as a mentor — complete the screening pipeline first',
      );
    }

    const participant = await this.prisma.participantProfile.findFirst({
      where: { id: input.participantProfileId, deletedAt: null },
    });
    if (!participant) throw new BadRequestException('Participant not found');

    const open = await this.prisma.mentorAssignment.findFirst({
      where: {
        mentorProfileId: input.mentorProfileId,
        participantProfileId: input.participantProfileId,
        status: { in: ['proposed', 'active', 'paused'] },
        deletedAt: null,
      },
    });
    if (open) {
      throw new ConflictException(
        'An open assignment between this mentor and participant already exists',
      );
    }

    // Don't propose matches to a mentor already at capacity.
    await this.assertMentorHasCapacity(input.mentorProfileId);

    const assignment = await this.prisma.mentorAssignment.create({
      data: { ...input, matchedById: userId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'mentor_assignment', assignment.id, assignment);
    return this.get(assignment.id);
  }

  async list(query: ListQuery, filters: AssignmentListFilters) {
    const where: Prisma.MentorAssignmentWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.mentorProfileId ? { mentorProfileId: filters.mentorProfileId } : {}),
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                mentorProfile: {
                  person: {
                    OR: [
                      { firstName: { contains: query.search, mode: 'insensitive' } },
                      { lastName: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                participantProfile: {
                  OR: [
                    { participantNumber: { contains: query.search, mode: 'insensitive' } },
                    {
                      person: {
                        OR: [
                          { firstName: { contains: query.search, mode: 'insensitive' } },
                          { lastName: { contains: query.search, mode: 'insensitive' } },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.MentorAssignmentOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.mentorAssignment.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: ASSIGNMENT_INCLUDE,
      }),
      this.prisma.mentorAssignment.count({ where }),
    ]);

    return { items: rows.map(toView), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const assignment = await this.prisma.mentorAssignment.findFirst({
      where: { id, deletedAt: null },
      include: ASSIGNMENT_INCLUDE,
    });
    if (!assignment) throw new NotFoundException('Mentor assignment not found');
    return toView(assignment);
  }

  private async getRaw(id: string) {
    const assignment = await this.prisma.mentorAssignment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!assignment) throw new NotFoundException('Mentor assignment not found');
    return assignment;
  }

  async update(
    id: string,
    input: Partial<
      Omit<MentorAssignmentInput, 'mentorProfileId' | 'participantProfileId' | 'status'>
    >,
    userId: string,
  ) {
    const existing = await this.getRaw(id);
    const updated = await this.prisma.mentorAssignment.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'mentor_assignment', id, existing, updated);
    return this.get(id);
  }

  /**
   * Case-manager approval (§6.7 workflow 4: the case manager owns the
   * participant relationship). The route guard only requires mentoring.read —
   * case managers hold read, not update, on this module — so the real gate is
   * here: the caller must BE the participant's assigned case manager or hold
   * case_management.update.
   */
  async activate(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.mentorAssignment.findFirst({
      where: { id, deletedAt: null },
      include: { participantProfile: { select: { assignedCaseManagerId: true } } },
    });
    if (!existing) throw new NotFoundException('Mentor assignment not found');

    const isAssignedCaseManager =
      existing.participantProfile.assignedCaseManagerId === user.id;
    if (!isAssignedCaseManager && !user.permissions.has('case_management.update')) {
      throw new ForbiddenException(
        "Only the participant's assigned case manager (or case-management staff) can activate a match",
      );
    }

    if (existing.status === 'active') {
      throw new ConflictException('Assignment is already active');
    }
    if (existing.status === 'ended') {
      // §4.1.6 history preservation: ended assignments stay closed.
      throw new BadRequestException(
        'Ended assignments cannot be reactivated — propose a new match instead',
      );
    }

    await this.assertMentorHasCapacity(existing.mentorProfileId, id);

    const updated = await this.prisma.mentorAssignment.update({
      where: { id },
      data: {
        status: 'active',
        startDate: existing.startDate ?? utcToday(),
        pauseReason: null,
        updatedById: user.id,
      },
    });
    const { participantProfile: _p, ...before } = existing;
    await this.audit.logUpdate(user.id, 'mentor_assignment', id, before, updated);
    return this.get(id);
  }

  async pause(id: string, input: MentorAssignmentPauseInput, userId: string) {
    const existing = await this.getRaw(id);
    if (existing.status !== 'active') {
      throw new BadRequestException('Only active assignments can be paused');
    }
    const updated = await this.prisma.mentorAssignment.update({
      where: { id },
      data: { status: 'paused', pauseReason: input.pauseReason, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'mentor_assignment', id, existing, updated);
    return this.get(id);
  }

  async end(id: string, input: MentorAssignmentEndInput, userId: string) {
    const existing = await this.getRaw(id);
    if (existing.status === 'ended') {
      throw new ConflictException('Assignment has already ended');
    }
    if (existing.startDate && input.endDate.getTime() < existing.startDate.getTime()) {
      throw new BadRequestException('End date cannot be before the assignment start date');
    }
    const updated = await this.prisma.mentorAssignment.update({
      where: { id },
      data: {
        status: 'ended',
        endDate: input.endDate,
        endReason: input.endReason,
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'mentor_assignment', id, existing, updated);
    return this.get(id);
  }

  // ── Session logs ──────────────────────────────────────────────────────────

  async logSession(input: MentorSessionLogInput, userId: string) {
    const assignment = await this.prisma.mentorAssignment.findFirst({
      where: { id: input.mentorAssignmentId, deletedAt: null },
    });
    if (!assignment) throw new BadRequestException('Mentor assignment not found');
    // Late entries against paused/ended assignments are fine; sessions before
    // case-manager approval are not (§6.7 workflow 4).
    if (assignment.status === 'proposed') {
      throw new BadRequestException(
        'Sessions can only be logged once the match has been activated',
      );
    }

    const log = await this.prisma.mentorSessionLog.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'mentor_session_log', log.id, log);
    return log;
  }

  async listSessions(query: ListQuery, filters: { mentorAssignmentId?: string }) {
    const where: Prisma.MentorSessionLogWhereInput = {
      ...(filters.mentorAssignmentId
        ? { mentorAssignmentId: filters.mentorAssignmentId }
        : {}),
    };

    const orderBy: Prisma.MentorSessionLogOrderByWithRelationInput =
      query.sortBy && SESSION_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { sessionDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.mentorSessionLog.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.mentorSessionLog.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  // ── Oversight dashboard (§6.7 workflow 5) ─────────────────────────────────

  async oversight() {
    const staleCutoff = daysAgo(30);
    const engagementCutoff = daysAgo(90);

    const [activeMatches, activeWithLastSession, alumniEngagementLast90Days, checkinsOverdue] =
      await this.prisma.$transaction([
        this.prisma.mentorAssignment.count({ where: { status: 'active', deletedAt: null } }),
        this.prisma.mentorAssignment.findMany({
          where: { status: 'active', deletedAt: null },
          include: {
            ...ASSIGNMENT_INCLUDE,
            sessionLogs: { orderBy: { sessionDate: 'desc' }, take: 1 },
          },
        }),
        this.prisma.alumniEngagement.count({
          where: { engagementDate: { gte: engagementCutoff } },
        }),
        this.prisma.outcomeCheckin.count({
          where: { completedDate: null, dueDate: { lt: utcToday() } },
        }),
      ]);

    // Standalone (not in the $transaction array): groupBy loses its precise
    // _count typing inside PrismaPromise tuples.
    const pipeline = await this.prisma.mentorScreening.groupBy({
      by: ['stage'],
      where: { stage: { notIn: ['approved', 'rejected', 'withdrawn'] } },
      _count: { _all: true },
      orderBy: { stage: 'asc' },
    });

    const matchesNoSessionIn30Days = activeWithLastSession
      .filter((a) => {
        const last = a.sessionLogs[0];
        return !last || last.sessionDate.getTime() < staleCutoff.getTime();
      })
      .map((a) => {
        const { sessionLogs, ...assignment } = a;
        return {
          ...toView(assignment),
          lastSessionDate: sessionLogs[0]?.sessionDate ?? null,
        };
      });

    return {
      activeMatches,
      matchesNoSessionIn30Days,
      screeningsInPipeline: Object.fromEntries(
        pipeline.map((row) => [row.stage, row._count._all]),
      ),
      alumniEngagementLast90Days,
      checkinsOverdue,
    };
  }
}
