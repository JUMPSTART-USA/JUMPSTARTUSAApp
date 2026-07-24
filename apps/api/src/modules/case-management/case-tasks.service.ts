import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { CaseTaskInput, ListQuery, TaskStatus } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertParticipant } from './participant.util';

export interface CaseTaskListFilters {
  assignedToId?: string;
  status?: TaskStatus;
  participantProfileId?: string;
  from?: Date;
  to?: Date;
}

const SORTABLE = new Set(['dueDate', 'status', 'title', 'createdAt']);

const TASK_INCLUDE = {
  assignedTo: { select: { firstName: true, lastName: true } },
  participantProfile: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} as const;

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

  async get(id: string) {
    const task = await this.prisma.caseTask.findFirst({
      where: { id, deletedAt: null },
      include: TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /** Body-supplied FKs → 400s instead of Prisma P2003 500s. */
  private async assertRelations(input: Partial<CaseTaskInput>) {
    if (input.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: input.assignedToId, deletedAt: null },
      });
      if (!assignee) throw new BadRequestException('Unknown assignee');
    }
    if (input.participantProfileId) {
      await assertParticipant(this.prisma, input.participantProfileId);
    }
    if (input.goalId) {
      const goal = await this.prisma.goal.findFirst({
        where: { id: input.goalId, servicePlan: { deletedAt: null } },
      });
      if (!goal) throw new BadRequestException('Unknown goal');
    }
    if (input.outboundReferralId) {
      const referral = await this.prisma.outboundReferral.findFirst({
        where: { id: input.outboundReferralId, deletedAt: null },
      });
      if (!referral) throw new BadRequestException('Unknown referral');
    }
  }

  async create(input: CaseTaskInput, userId: string) {
    await this.assertRelations(input);
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

  async update(id: string, input: Partial<CaseTaskInput>, userId: string) {
    const existing = await this.prisma.caseTask.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.assertRelations(input);

    // completedAt tracks the status column, not the other way around.
    const data: Prisma.CaseTaskUncheckedUpdateInput = { ...input, updatedById: userId };
    if (input.status && input.status !== existing.status) {
      data.completedAt = input.status === 'completed' ? new Date() : null;
    }

    const updated = await this.prisma.caseTask.update({ where: { id }, data });
    await this.audit.logUpdate(userId, 'case_task', id, existing, updated);
    return updated;
  }

  async complete(id: string, userId: string) {
    const existing = await this.prisma.caseTask.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Task not found');
    if (existing.status === 'completed') throw new ConflictException('Task is already completed');
    const updated = await this.prisma.caseTask.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date(), updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'case_task', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.prisma.caseTask.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.prisma.caseTask.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'case_task', id, existing);
    return { ok: true };
  }
}
