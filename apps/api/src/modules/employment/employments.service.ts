import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CaseTask, EmploymentStatus, Prisma } from '@jumpstart/database';
import type { EmploymentInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { hasPerm, type AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';

export interface EmploymentListFilters {
  participantProfileId?: string;
  employerId?: string;
  status?: EmploymentStatus;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['jobTitle', 'status', 'startDate', 'endDate', 'createdAt']);

/** Once a record hits one of these it is closed history (§6.9). */
const TERMINAL: ReadonlySet<EmploymentStatus> = new Set(['terminated', 'resigned', 'completed']);

const NAME_INCLUDE = {
  employer: { select: { id: true, name: true } },
  participantProfile: {
    select: {
      id: true,
      participantNumber: true,
      chapterState: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.ParticipantEmploymentInclude;

@Injectable()
export class EmploymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** §7.2 pay field class: payRate/payPeriod/hoursPerWeek require fields.pay.read. */
  private stripPay<T extends { payRate?: unknown; payPeriod?: unknown; hoursPerWeek?: unknown }>(
    record: T,
    user: AuthenticatedUser,
  ) {
    if (hasPerm(user, 'fields.pay.read')) return record;
    const { payRate, payPeriod, hoursPerWeek, ...rest } = record;
    return rest;
  }

  /**
   * Write side of the §7.2 pay field class (mirrors stripPay): a user who
   * cannot read pay must not be able to set or overwrite it either, so the
   * pay fields are dropped from create/update payloads before they reach
   * Prisma. payPeriod falls back to its column default on create.
   */
  private stripPayWrites<
    T extends { payRate?: unknown; payPeriod?: unknown; hoursPerWeek?: unknown },
  >(input: T, user: AuthenticatedUser) {
    if (hasPerm(user, 'fields.pay.read')) return input;
    const { payRate, payPeriod, hoursPerWeek, ...rest } = input;
    return rest;
  }

  async list(query: ListQuery, filters: EmploymentListFilters, user: AuthenticatedUser) {
    const where: Prisma.ParticipantEmploymentWhereInput = {
      deletedAt: null,
      // Chapter scoping (§7.2): derived via the participant's chapter.
      ...(user.chapter ? { participantProfile: { chapterState: user.chapter } } : {}),
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.employerId ? { employerId: filters.employerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(query.search
        ? {
            OR: [
              { jobTitle: { contains: query.search, mode: 'insensitive' } },
              { employer: { name: { contains: query.search, mode: 'insensitive' } } },
              {
                participantProfile: {
                  person: {
                    OR: [
                      { firstName: { contains: query.search, mode: 'insensitive' } },
                      { lastName: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ParticipantEmploymentOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.participantEmployment.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: NAME_INCLUDE,
      }),
      this.prisma.participantEmployment.count({ where }),
    ]);

    return {
      items: items.map((item) => this.stripPay(item, user)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, user: AuthenticatedUser) {
    const employment = await this.prisma.participantEmployment.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...NAME_INCLUDE,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!employment) throw new NotFoundException('Employment record not found');
    // Chapter scoping (§7.2): same derivation as the list filter.
    assertChapterAccess(user.chapter, employment.participantProfile.chapterState);
    return this.stripPay(employment, user);
  }

  /** Unstripped fetch for internal use (guards, audit diffs) — never returned raw. */
  private async getRaw(id: string) {
    const employment = await this.prisma.participantEmployment.findFirst({
      where: { id, deletedAt: null },
      // Participant chapter carried along for the §7.2 asserts.
      include: { participantProfile: { select: { chapterState: true } } },
    });
    if (!employment) throw new NotFoundException('Employment record not found');
    return employment;
  }

  async create(input: EmploymentInput, user: AuthenticatedUser) {
    const [participant, employer] = await Promise.all([
      this.prisma.participantProfile.findFirst({
        where: { id: input.participantProfileId, deletedAt: null },
        select: { id: true, chapterState: true },
      }),
      this.prisma.employer.findFirst({
        where: { id: input.employerId, deletedAt: null },
        select: { id: true, chapterState: true },
      }),
    ]);
    if (!participant) throw new BadRequestException('Participant not found');
    if (!employer) throw new BadRequestException('Employer not found');
    // Chapter scoping (§7.2): the record inherits the participant's chapter;
    // the linked employer must belong to that same chapter (for everyone).
    assertChapterAccess(user.chapter, participant.chapterState);
    assertChapterAccess(user.chapter, employer.chapterState);
    if (employer.chapterState !== participant.chapterState) {
      throw new BadRequestException(
        'Employer belongs to a different chapter than the participant',
      );
    }

    // §7.2: without fields.pay.read the pay fields never reach the row.
    const data = this.stripPayWrites(input, user);

    const { employment, tasks } = await this.prisma.$transaction(async (tx) => {
      const employment = await tx.participantEmployment.create({
        data: { ...data, createdById: user.id, updatedById: user.id },
      });
      // Every record opens its own history trail (§6.9).
      await tx.employmentStatusHistory.create({
        data: {
          employmentId: employment.id,
          fromStatus: null,
          toStatus: employment.status,
          effectiveDate: new Date(),
          changedById: user.id,
        },
      });
      const tasks =
        employment.status === 'active'
          ? await this.createRetentionTasks(tx, employment, user.id)
          : [];
      return { employment, tasks };
    });

    await this.audit.logCreate(user.id, 'participantEmployment', employment.id, employment);
    for (const task of tasks) {
      await this.audit.logCreate(user.id, 'caseTask', task.id, task);
    }
    return this.stripPay(employment, user);
  }

  async update(id: string, input: Partial<EmploymentInput>, user: AuthenticatedUser) {
    const existing = await this.getRaw(id);
    // Chapter scoping (§7.2): same derivation as the list filter.
    assertChapterAccess(user.chapter, existing.participantProfile.chapterState);

    // History preservation (§6.9): a record belongs to one participant forever.
    if (
      input.participantProfileId &&
      input.participantProfileId !== existing.participantProfileId
    ) {
      throw new BadRequestException(
        'An employment record cannot be moved to another participant — create a new record',
      );
    }
    if (input.employerId && input.employerId !== existing.employerId) {
      // A job change is a NEW record, never an employer swap on closed history (§6.9).
      if (TERMINAL.has(existing.status)) {
        throw new ConflictException(
          `This employment has ended (${existing.status}) — a job change is a new employment record, not an employer change`,
        );
      }
      const employer = await this.prisma.employer.findFirst({
        where: { id: input.employerId, deletedAt: null },
        select: { id: true, chapterState: true },
      });
      if (!employer) throw new BadRequestException('Employer not found');
      // Chapter scoping (§7.2): the replacement employer must stay in the
      // record's chapter (the participant's).
      if (employer.chapterState !== existing.participantProfile.chapterState) {
        throw new BadRequestException(
          'Employer belongs to a different chapter than the participant',
        );
      }
    }

    const statusChanged = input.status !== undefined && input.status !== existing.status;

    // §7.2: without fields.pay.read a patch cannot touch the pay fields.
    const patch = this.stripPayWrites(input, user);

    const { updated, tasks } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.participantEmployment.update({
        where: { id },
        data: { ...patch, updatedById: user.id },
      });
      let tasks: CaseTask[] = [];
      if (statusChanged) {
        // Append-only status history — preserved, never overwritten (§4.1.6, §6.9).
        await tx.employmentStatusHistory.create({
          data: {
            employmentId: id,
            fromStatus: existing.status,
            toStatus: updated.status,
            effectiveDate: new Date(),
            changedById: user.id,
          },
        });
        if (updated.status === 'active') {
          tasks = await this.createRetentionTasks(tx, updated, user.id);
        }
      }
      return { updated, tasks };
    });

    await this.audit.logUpdate(user.id, 'participantEmployment', id, existing, updated);
    for (const task of tasks) {
      await this.audit.logCreate(user.id, 'caseTask', task.id, task);
    }
    return this.stripPay(updated, user);
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const existing = await this.getRaw(id);
    // Chapter scoping (§7.2): same derivation as the list filter.
    assertChapterAccess(user.chapter, existing.participantProfile.chapterState);
    await this.prisma.participantEmployment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: user.id },
    });
    // Status history rows are append-only and remain untouched.
    await this.audit.logDelete(user.id, 'participantEmployment', id, existing);
    return { ok: true };
  }

  /**
   * 30/60/90-day retention checkpoints (§6.9): created when a placement goes
   * active, assigned to the participant's case manager (fallback: acting
   * user), due relative to the start date. They land in the case-management
   * task queue and feed the §6.5 follow-up workflow.
   */
  private async createRetentionTasks(
    tx: Prisma.TransactionClient,
    employment: { id: string; participantProfileId: string; startDate: Date | null },
    userId: string,
  ): Promise<CaseTask[]> {
    const participant = await tx.participantProfile.findUnique({
      where: { id: employment.participantProfileId },
      select: { assignedCaseManagerId: true },
    });
    const assignedToId = participant?.assignedCaseManagerId ?? userId;
    const base = employment.startDate ?? new Date();

    const tasks: CaseTask[] = [];
    for (const days of [30, 60, 90]) {
      const dueDate = new Date(base);
      dueDate.setDate(dueDate.getDate() + days);
      tasks.push(
        await tx.caseTask.create({
          data: {
            title: `${days}-day employment check-in`,
            details:
              'Employment retention checkpoint (§6.9): confirm the participant is still employed and address any job issues.',
            assignedToId,
            dueDate,
            participantProfileId: employment.participantProfileId,
            createdById: userId,
            updatedById: userId,
          },
        }),
      );
    }
    return tasks;
  }
}
