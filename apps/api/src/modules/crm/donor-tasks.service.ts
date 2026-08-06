import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  DonorTaskInput,
  DonorTaskStatus,
  InteractionChannel,
  InteractionPurpose,
  ListQuery,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfUtcDay } from './giving.util';

export interface DonorTaskListFilters {
  donorId?: string;
  /** Already resolved — the controller maps 'me' to the caller's user id. */
  assignedToId?: string;
  status?: DonorTaskStatus;
  overdue?: boolean;
}

/** Completing a task can log the touchpoint it represents in one step. */
export interface DonorTaskUpdate extends Partial<DonorTaskInput> {
  logInteraction?: { channel: InteractionChannel; purpose: InteractionPurpose };
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['dueDate', 'status', 'subject', 'createdAt']);

@Injectable()
export class DonorTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: DonorTaskListFilters) {
    const where: Prisma.DonorTaskWhereInput = {
      donor: { deletedAt: null },
      ...(filters.donorId ? { donorId: filters.donorId } : {}),
      ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.overdue
        ? { status: 'open', dueDate: { lt: startOfUtcDay(new Date()) } }
        : {}),
      ...(query.search ? { subject: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const orderBy: Prisma.DonorTaskOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { dueDate: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.donorTask.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { donor: { select: { id: true, name: true } } },
      }),
      this.prisma.donorTask.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async create(input: DonorTaskInput, userId: string) {
    await this.assertDonorExists(input.donorId);
    await this.assertUserExists(input.assignedToId);
    const task = await this.prisma.donorTask.create({
      data: {
        ...input,
        ...(input.status === 'completed' ? { completedAt: new Date() } : {}),
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'donor_task', task.id, task);
    return task;
  }

  async update(id: string, input: DonorTaskUpdate, userId: string) {
    const existing = await this.prisma.donorTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    const { logInteraction, ...data } = input;
    if (data.donorId && data.donorId !== existing.donorId) {
      await this.assertDonorExists(data.donorId);
    }
    if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
      await this.assertUserExists(data.assignedToId);
    }

    const completing = data.status === 'completed' && existing.status !== 'completed';
    const updated = await this.prisma.donorTask.update({
      where: { id },
      data: {
        ...data,
        ...(completing ? { completedAt: new Date() } : {}),
        // Reopening clears the completion stamp.
        ...(data.status === 'open' ? { completedAt: null } : {}),
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'donor_task', id, existing, updated);

    // Optional one-step "log as interaction" on completion.
    if (completing && logInteraction) {
      const interaction = await this.prisma.donorInteraction.create({
        data: {
          donorId: updated.donorId,
          date: startOfUtcDay(new Date()),
          channel: logInteraction.channel,
          purpose: logInteraction.purpose,
          subject: updated.subject,
          notes: updated.notes,
          isInbound: false,
          createdById: userId,
          updatedById: userId,
        },
      });
      await this.audit.logCreate(userId, 'donor_interaction', interaction.id, interaction);
    }
    return updated;
  }

  // No deletedAt column — delete exists for corrections only; the audit row
  // keeps what was removed.
  async remove(id: string, userId: string) {
    const existing = await this.prisma.donorTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.prisma.donorTask.delete({ where: { id } });
    await this.audit.logDelete(userId, 'donor_task', id, existing);
    return { ok: true };
  }

  private async assertDonorExists(donorId: string) {
    const donor = await this.prisma.donor.findFirst({
      where: { id: donorId, deletedAt: null },
    });
    if (!donor) throw new BadRequestException('Donor not found');
  }

  private async assertUserExists(userId?: string | null) {
    if (!userId) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Assigned user not found');
  }
}
