import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { CaseTaskInput, ListQuery, TaskStatus } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { assertParticipant } from './participant.util';

export interface CaseTaskListFilters {
  assignedToId?: string;
  status?: TaskStatus;
  participantProfileId?: string;
  from?: Date;
  to?: Date;
  state?: string;
}

const SORTABLE = new Set(['dueDate', 'status', 'title', 'createdAt']);

const TASK_INCLUDE = {
  assignedTo: { select: { firstName: true, lastName: true } },
  participantProfile: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} as const;

/**
 * Chapter derivation chains (§7.2): a task belongs to its participant's
 * chapter; a task linked only through a goal or referral inherits THAT
 * parent's participant. A task with no participant-bearing parent is a
 * chapter-neutral staff to-do (assertChapterAccess passes on null).
 */
const TASK_CHAPTER_INCLUDE = {
  participantProfile: { select: { chapterState: true } },
  goal: {
    select: {
      servicePlan: {
        select: { participantProfile: { select: { chapterState: true } } },
      },
    },
  },
  outboundReferral: {
    select: { participantProfile: { select: { chapterState: true } } },
  },
} as const;

interface TaskChapterRelations {
  participantProfile: { chapterState: string } | null;
  goal: { servicePlan: { participantProfile: { chapterState: string } } } | null;
  outboundReferral: { participantProfile: { chapterState: string } } | null;
}

function taskChapter(task: TaskChapterRelations): string | null {
  return (
    task.participantProfile?.chapterState ??
    task.goal?.servicePlan.participantProfile.chapterState ??
    task.outboundReferral?.participantProfile.chapterState ??
    null
  );
}

@Injectable()
export class CaseTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: CaseTaskListFilters) {
    const where: Prisma.CaseTaskWhereInput = {
      deletedAt: null,
      ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      // Chapter scoping (§7.2): mirrors taskChapter()'s fallback order so the
      // list shows exactly what get() lets through — direct participant, else
      // the goal's or referral's participant. A task with no participant-bearing
      // parent is a chapter-neutral staff to-do and stays visible. Wrapped in
      // AND so it can coexist with the search OR.
      ...(filters.state
        ? {
            AND: [
              {
                OR: [
                  { participantProfile: { chapterState: filters.state } },
                  {
                    participantProfileId: null,
                    goal: {
                      servicePlan: { participantProfile: { chapterState: filters.state } },
                    },
                  },
                  {
                    participantProfileId: null,
                    goalId: null,
                    outboundReferral: { participantProfile: { chapterState: filters.state } },
                  },
                  { participantProfileId: null, goalId: null, outboundReferralId: null },
                ],
              },
            ],
          }
        : {}),
      ...(filters.from || filters.to
        ? {
            dueDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { details: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.CaseTaskOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { dueDate: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.caseTask.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: TASK_INCLUDE,
      }),
      this.prisma.caseTask.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const task = await this.prisma.caseTask.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...TASK_CHAPTER_INCLUDE,
        assignedTo: { select: { firstName: true, lastName: true } },
        participantProfile: {
          select: { chapterState: true, person: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    // Chapter scoping (§7.2): direct participant, else goal/referral parent.
    assertChapterAccess(user.chapter, taskChapter(task));
    const { goal: _goal, outboundReferral: _outboundReferral, ...taskOnly } = task;
    return taskOnly;
  }

  /** Body-supplied FKs → 400s instead of Prisma P2003 500s. */
  private async assertRelations(input: Partial<CaseTaskInput>, userChapter: string | null) {
    if (input.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: input.assignedToId, deletedAt: null },
      });
      if (!assignee) throw new BadRequestException('Unknown assignee');
    }
    if (input.participantProfileId) {
      await assertParticipant(this.prisma, input.participantProfileId, userChapter);
    }
    if (input.goalId) {
      const goal = await this.prisma.goal.findFirst({
        where: { id: input.goalId, servicePlan: { deletedAt: null } },
        include: {
          servicePlan: {
            select: { participantProfile: { select: { chapterState: true } } },
          },
        },
      });
      if (!goal) throw new BadRequestException('Unknown goal');
      // Chapter scoping (§7.2): a linked goal must be in the user's chapter.
      assertChapterAccess(userChapter, goal.servicePlan.participantProfile.chapterState);
    }
    if (input.outboundReferralId) {
      const referral = await this.prisma.outboundReferral.findFirst({
        where: { id: input.outboundReferralId, deletedAt: null },
        include: { participantProfile: { select: { chapterState: true } } },
      });
      if (!referral) throw new BadRequestException('Unknown referral');
      // Chapter scoping (§7.2): a linked referral must be in the user's chapter.
      assertChapterAccess(userChapter, referral.participantProfile.chapterState);
    }
  }

  async create(input: CaseTaskInput, user: AuthenticatedUser) {
    const userId = user.id;
    await this.assertRelations(input, user.chapter);
    const task = await this.prisma.caseTask.create({
      data: {
        ...input,
        completedAt: input.status === 'completed' ? new Date() : null,
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'case_task', task.id, task);
    return task;
  }

  async update(id: string, input: Partial<CaseTaskInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.getForModify(id, user);
    await this.assertRelations(input, user.chapter);

    // completedAt tracks the status column, not the other way around.
    const data: Prisma.CaseTaskUncheckedUpdateInput = { ...input, updatedById: userId };
    if (input.status && input.status !== existing.status) {
      data.completedAt = input.status === 'completed' ? new Date() : null;
    }

    const updated = await this.prisma.caseTask.update({ where: { id }, data });
    await this.audit.logUpdate(userId, 'case_task', id, existing, updated);
    return updated;
  }

  async complete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.getForModify(id, user);
    if (existing.status === 'completed') throw new ConflictException('Task is already completed');
    const updated = await this.prisma.caseTask.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date(), updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'case_task', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.getForModify(id, user);
    await this.prisma.caseTask.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'case_task', id, existing);
    return { ok: true };
  }

  /** Fetch-for-mutation with the chapter guard (§7.2) applied once. */
  private async getForModify(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.caseTask.findFirst({
      where: { id, deletedAt: null },
      include: TASK_CHAPTER_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Task not found');
    assertChapterAccess(user.chapter, taskChapter(existing));
    const {
      participantProfile: _participantProfile,
      goal: _goal,
      outboundReferral: _outboundReferral,
      ...taskOnly
    } = existing;
    return taskOnly;
  }
}
