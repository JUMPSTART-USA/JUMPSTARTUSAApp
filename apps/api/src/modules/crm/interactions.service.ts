import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  DonorInteractionInput,
  InteractionChannel,
  InteractionPurpose,
  ListQuery,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface InteractionListFilters {
  donorId?: string;
  channel?: InteractionChannel;
  purpose?: InteractionPurpose;
  /** Chapter filter — the controller forces `user.chapter ?? requested`. */
  state?: string;
  from?: Date;
  to?: Date;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['date', 'channel', 'purpose', 'subject', 'createdAt']);

@Injectable()
export class InteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: InteractionListFilters) {
    const where: Prisma.DonorInteractionWhereInput = {
      // Chapter scoping (§7.2): interactions derive chapter through their donor.
      donor: { deletedAt: null, ...(filters.state ? { chapterState: filters.state } : {}) },
      ...(filters.donorId ? { donorId: filters.donorId } : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.purpose ? { purpose: filters.purpose } : {}),
      ...(filters.from || filters.to
        ? {
            date: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search ? { subject: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const orderBy: Prisma.DonorInteractionOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { date: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.donorInteraction.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { donor: { select: { id: true, name: true } } },
      }),
      this.prisma.donorInteraction.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async create(input: DonorInteractionInput, user: AuthenticatedUser) {
    const userId = user.id;
    await this.assertDonorAccess(input.donorId, user);
    const interaction = await this.prisma.donorInteraction.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'donor_interaction', interaction.id, interaction);
    return interaction;
  }

  async update(id: string, input: Partial<DonorInteractionInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.donorInteraction.findUnique({
      where: { id },
      include: { donor: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Interaction not found');
    // Chapter scoping (§7.2): derived through the parent donor.
    assertChapterAccess(user.chapter, existing.donor.chapterState);
    const { donor: _donor, ...interactionOnly } = existing;
    if (input.donorId && input.donorId !== existing.donorId) {
      await this.assertDonorAccess(input.donorId, user);
    }
    const updated = await this.prisma.donorInteraction.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'donor_interaction', id, interactionOnly, updated);
    return updated;
  }

  // No deletedAt column — delete exists for corrections only; the audit row
  // keeps what was removed (same convention as volunteer trainings).
  async remove(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.donorInteraction.findUnique({
      where: { id },
      include: { donor: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Interaction not found');
    // Chapter scoping (§7.2): derived through the parent donor.
    assertChapterAccess(user.chapter, existing.donor.chapterState);
    const { donor: _donor, ...interactionOnly } = existing;
    await this.prisma.donorInteraction.delete({ where: { id } });
    await this.audit.logDelete(userId, 'donor_interaction', id, interactionOnly);
    return { ok: true };
  }

  private async assertDonorAccess(donorId: string, user: AuthenticatedUser) {
    const donor = await this.prisma.donor.findFirst({
      where: { id: donorId, deletedAt: null },
    });
    if (!donor) throw new BadRequestException('Donor not found');
    // Chapter scoping (§7.2): the referenced donor must be in the user's chapter.
    assertChapterAccess(user.chapter, donor.chapterState);
  }
}
