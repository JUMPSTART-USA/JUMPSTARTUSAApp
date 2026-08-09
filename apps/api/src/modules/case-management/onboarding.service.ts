import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ChecklistItemUpdateInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { assertParticipant } from './participant.util';

export interface CreateChecklistInput {
  participantProfileId: string;
  templateId?: string;
}

const SORTABLE = new Set(['startedAt', 'completedAt', 'createdAt']);

const CHECKLIST_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  template: { select: { name: true } },
  participantProfile: {
    select: { chapterState: true, person: { select: { firstName: true, lastName: true } } },
  },
} as const;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Instantiate a checklist from a template (the default template when none is
   * given). Items SNAPSHOT label/sortOrder/required — templates are
   * admin-editable (§6.5) and later edits must not rewrite in-flight
   * checklists; templateItemId is provenance only.
   */
  async createChecklist(input: CreateChecklistInput, user: AuthenticatedUser) {
    const userId = user.id;
    await assertParticipant(this.prisma, input.participantProfileId, user.chapter);

    const open = await this.prisma.onboardingChecklist.findFirst({
      where: { participantProfileId: input.participantProfileId, completedAt: null },
    });
    if (open) {
      throw new ConflictException('Participant already has an onboarding checklist in progress');
    }

    const template = await this.prisma.onboardingChecklistTemplate.findFirst({
      where: input.templateId
        ? { id: input.templateId, active: true }
        : { isDefault: true, active: true },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) {
      throw new BadRequestException(
        input.templateId
          ? 'Unknown or inactive checklist template'
          : 'No default onboarding checklist template is configured',
      );
    }
    if (template.items.length === 0) {
      throw new BadRequestException('The checklist template has no items');
    }

    const checklist = await this.prisma.onboardingChecklist.create({
      data: {
        participantProfileId: input.participantProfileId,
        templateId: template.id,
        createdById: userId,
        updatedById: userId,
        items: {
          create: template.items.map((item) => ({
            label: item.label,
            sortOrder: item.sortOrder,
            required: item.required,
            templateItemId: item.id,
          })),
        },
      },
      include: CHECKLIST_INCLUDE,
    });
    await this.audit.logCreate(userId, 'onboarding_checklist', checklist.id, checklist);
    return checklist;
  }

  async listChecklists(
    query: ListQuery,
    filters: { participantProfileId?: string; state?: string },
  ) {
    const where: Prisma.OnboardingChecklistWhereInput = {
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      // Chapter scoping (§7.2): derived through the participant profile.
      ...(filters.state ? { participantProfile: { chapterState: filters.state } } : {}),
    };

    const orderBy: Prisma.OnboardingChecklistOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { startedAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.onboardingChecklist.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: CHECKLIST_INCLUDE,
      }),
      this.prisma.onboardingChecklist.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getChecklist(id: string, user: AuthenticatedUser) {
    const checklist = await this.prisma.onboardingChecklist.findFirst({
      where: { id },
      include: CHECKLIST_INCLUDE,
    });
    if (!checklist) throw new NotFoundException('Onboarding checklist not found');
    // Chapter scoping (§7.2): same derivation as the list filter (participant).
    assertChapterAccess(user.chapter, checklist.participantProfile.chapterState);
    return checklist;
  }

  async updateItem(itemId: string, input: ChecklistItemUpdateInput, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.onboardingChecklistItem.findFirst({
      where: { id: itemId },
      include: {
        checklist: {
          include: { participantProfile: { select: { chapterState: true } } },
        },
      },
    });
    if (!existing) throw new NotFoundException('Checklist item not found');
    // Chapter scoping (§7.2): derived through the checklist's participant.
    assertChapterAccess(user.chapter, existing.checklist.participantProfile.chapterState);

    const becameCompleted = input.status === 'completed';
    const item = await this.prisma.onboardingChecklistItem.update({
      where: { id: itemId },
      data: {
        status: input.status,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        // completedAt/By tracks the 'completed' status exactly; not_applicable
        // satisfies the checklist without claiming someone completed the item.
        completedAt: becameCompleted ? (existing.completedAt ?? new Date()) : null,
        completedById: becameCompleted ? (existing.completedById ?? userId) : null,
      },
    });
    await this.audit.logUpdate(userId, 'onboarding_checklist_item', itemId, existing, item);

    // A checklist is complete when every REQUIRED item is completed or
    // not_applicable; it reopens if a required item is reverted.
    const siblings = await this.prisma.onboardingChecklistItem.findMany({
      where: { checklistId: existing.checklistId },
      select: { required: true, status: true },
    });
    const allRequiredDone = siblings
      .filter((s) => s.required)
      .every((s) => s.status === 'completed' || s.status === 'not_applicable');

    let checklistCompletedAt = existing.checklist.completedAt;
    if (allRequiredDone !== Boolean(existing.checklist.completedAt)) {
      const updatedChecklist = await this.prisma.onboardingChecklist.update({
        where: { id: existing.checklistId },
        data: { completedAt: allRequiredDone ? new Date() : null, updatedById: userId },
      });
      await this.audit.logUpdate(
        userId,
        'onboarding_checklist',
        existing.checklistId,
        existing.checklist,
        updatedChecklist,
      );
      checklistCompletedAt = updatedChecklist.completedAt;
    }

    return { item, checklistCompletedAt };
  }
}
