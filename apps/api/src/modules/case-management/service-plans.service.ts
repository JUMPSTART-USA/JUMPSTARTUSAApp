import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { GoalInput, GoalMilestoneInput, ListQuery, ServicePlanInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertParticipant } from './participant.util';

export interface ServicePlanListFilters {
  participantProfileId?: string;
  status?: string;
}

const SORTABLE = new Set(['title', 'status', 'reviewDate', 'createdAt']);

// Nested-create payloads: the parent id comes from the URL, not the body.
export type GoalCreateInput = Omit<GoalInput, 'servicePlanId'>;
export type MilestoneCreateInput = Omit<GoalMilestoneInput, 'goalId'>;

@Injectable()
export class ServicePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: ServicePlanListFilters) {
    const where: Prisma.ServicePlanWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const orderBy: Prisma.ServicePlanOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.servicePlan.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          participantProfile: {
            select: { person: { select: { firstName: true, lastName: true } } },
          },
          _count: { select: { goals: true } },
        },
      }),
      this.prisma.servicePlan.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const plan = await this.prisma.servicePlan.findFirst({
      where: { id, deletedAt: null },
      include: {
        participantProfile: {
          select: { person: { select: { firstName: true, lastName: true } } },
        },
        goals: {
          orderBy: { createdAt: 'asc' },
          include: { milestones: { orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] } },
        },
      },
    });
    if (!plan) throw new NotFoundException('Service plan not found');
    return plan;
  }

  /** §6.5 — "plan per participant": at most one ACTIVE plan at a time. */
  private async assertNoOtherActivePlan(participantProfileId: string, excludeId?: string) {
    const other = await this.prisma.servicePlan.findFirst({
      where: {
        participantProfileId,
        status: 'active',
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (other) {
      throw new ConflictException(
        'Participant already has an active service plan — complete or archive it first',
      );
    }
  }

  async create(input: ServicePlanInput, userId: string) {
    await assertParticipant(this.prisma, input.participantProfileId);
    if (input.status === 'active') {
      await this.assertNoOtherActivePlan(input.participantProfileId);
    }
    const plan = await this.prisma.servicePlan.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'service_plan', plan.id, plan);
    return plan;
  }

  async update(id: string, input: Partial<ServicePlanInput>, userId: string) {
    const existing = await this.prisma.servicePlan.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Service plan not found');
    // Re-parenting a case plan is always a mistake — new participant, new plan.
    if (input.participantProfileId && input.participantProfileId !== existing.participantProfileId) {
      throw new BadRequestException('A service plan cannot be moved to another participant');
    }
    if (input.status === 'active' && existing.status !== 'active') {
      await this.assertNoOtherActivePlan(existing.participantProfileId, id);
    }
    const updated = await this.prisma.servicePlan.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'service_plan', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.prisma.servicePlan.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Service plan not found');
    await this.prisma.servicePlan.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'service_plan', id, existing);
    return { ok: true };
  }

  // ── Goals ─────────────────────────────────────────────────────────────────
  // Goals have no deletedAt — the lifecycle ends at status 'abandoned', so no
  // delete endpoint exists for them.

  async createGoal(servicePlanId: string, input: GoalCreateInput, userId: string) {
    const plan = await this.prisma.servicePlan.findFirst({
      where: { id: servicePlanId, deletedAt: null },
    });
    if (!plan) throw new NotFoundException('Service plan not found');
    const goal = await this.prisma.goal.create({
      data: { ...input, servicePlanId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'goal', goal.id, goal);
    return goal;
  }

  private async getGoal(goalId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, servicePlan: { deletedAt: null } },
    });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  async updateGoal(goalId: string, input: Partial<GoalCreateInput>, userId: string) {
    const existing = await this.getGoal(goalId);
    const updated = await this.prisma.goal.update({
      where: { id: goalId },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'goal', goalId, existing, updated);
    return updated;
  }

  // ── Milestones ────────────────────────────────────────────────────────────

  async createMilestone(goalId: string, input: MilestoneCreateInput, userId: string) {
    await this.getGoal(goalId);
    const milestone = await this.prisma.goalMilestone.create({
      data: { ...input, goalId },
    });
    await this.audit.logCreate(userId, 'goal_milestone', milestone.id, milestone);
    return milestone;
  }

  private async getMilestone(milestoneId: string) {
    const milestone = await this.prisma.goalMilestone.findFirst({
      where: { id: milestoneId, goal: { servicePlan: { deletedAt: null } } },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    return milestone;
  }

  async updateMilestone(milestoneId: string, input: Partial<MilestoneCreateInput>, userId: string) {
    const existing = await this.getMilestone(milestoneId);
    const updated = await this.prisma.goalMilestone.update({
      where: { id: milestoneId },
      data: input,
    });
    await this.audit.logUpdate(userId, 'goal_milestone', milestoneId, existing, updated);
    return updated;
  }

  async completeMilestone(milestoneId: string, userId: string) {
    const existing = await this.getMilestone(milestoneId);
    if (existing.completedAt) throw new ConflictException('Milestone is already completed');
    const updated = await this.prisma.goalMilestone.update({
      where: { id: milestoneId },
      data: { completedAt: new Date() },
    });
    await this.audit.logUpdate(userId, 'goal_milestone', milestoneId, existing, updated);
    return updated;
  }

  async uncompleteMilestone(milestoneId: string, userId: string) {
    const existing = await this.getMilestone(milestoneId);
    if (!existing.completedAt) throw new ConflictException('Milestone is not completed');
    const updated = await this.prisma.goalMilestone.update({
      where: { id: milestoneId },
      data: { completedAt: null },
    });
    await this.audit.logUpdate(userId, 'goal_milestone', milestoneId, existing, updated);
    return updated;
  }

  /** Hard delete — milestones have no deletedAt; completed ones are kept. */
  async deleteMilestone(milestoneId: string, userId: string) {
    const existing = await this.getMilestone(milestoneId);
    if (existing.completedAt) {
      throw new BadRequestException('Uncomplete the milestone before deleting it');
    }
    await this.prisma.goalMilestone.delete({ where: { id: milestoneId } });
    await this.audit.logDelete(userId, 'goal_milestone', milestoneId, existing);
    return { ok: true };
  }
}
