import { Injectable, NotFoundException } from '@nestjs/common';
import type { ChecklistTemplateInput, MentorScreeningTemplateInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Template administration (§6.14): onboarding checklist templates (§6.5) and
 * mentor screening templates (§6.7). Instantiated checklists/screenings hold
 * SNAPSHOTS of template items, so edits here never rewrite in-flight or
 * historical records — updates replace template items wholesale.
 *
 * Templates have no deletedAt: DELETE deactivates (active=false) so existing
 * instances keep a resolvable templateId.
 */
@Injectable()
export class AdminTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Onboarding checklist templates (§6.5) ────────────────────────────────

  listChecklistTemplates() {
    return this.prisma.onboardingChecklistTemplate.findMany({
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { checklists: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getChecklistTemplate(id: string) {
    const template = await this.prisma.onboardingChecklistTemplate.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { checklists: true } },
      },
    });
    if (!template) throw new NotFoundException('Checklist template not found');
    return template;
  }

  async createChecklistTemplate(input: ChecklistTemplateInput, userId: string) {
    const { items, ...fields } = input;
    const created = await this.prisma.$transaction(async (tx) => {
      // Single default at a time.
      if (fields.isDefault) {
        await tx.onboardingChecklistTemplate.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.onboardingChecklistTemplate.create({
        data: {
          ...fields,
          createdById: userId,
          updatedById: userId,
          items: { create: items },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    await this.audit.logCreate(userId, 'onboarding_checklist_template', created.id, created);
    return created;
  }

  async updateChecklistTemplate(id: string, input: ChecklistTemplateInput, userId: string) {
    const existing = await this.getChecklistTemplate(id);
    const { items, ...fields } = input;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (fields.isDefault) {
        await tx.onboardingChecklistTemplate.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      // Wholesale item replacement — instantiated checklists carry snapshots
      // and are untouched.
      await tx.onboardingChecklistTemplateItem.deleteMany({ where: { templateId: id } });
      return tx.onboardingChecklistTemplate.update({
        where: { id },
        data: { ...fields, updatedById: userId, items: { create: items } },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await this.audit.logUpdate(userId, 'onboarding_checklist_template', id, existing, updated);
    return updated;
  }

  async deactivateChecklistTemplate(id: string, userId: string) {
    const existing = await this.getChecklistTemplate(id);
    await this.prisma.onboardingChecklistTemplate.update({
      where: { id },
      data: { active: false, isDefault: false, updatedById: userId },
    });
    await this.audit.logUpdate(
      userId,
      'onboarding_checklist_template',
      id,
      { active: existing.active, isDefault: existing.isDefault },
      { active: false, isDefault: false },
    );
    return { ok: true };
  }

  // ── Mentor screening templates (§6.7) ────────────────────────────────────

  listScreeningTemplates() {
    return this.prisma.mentorScreeningTemplate.findMany({
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { screenings: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getScreeningTemplate(id: string) {
    const template = await this.prisma.mentorScreeningTemplate.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { screenings: true } },
      },
    });
    if (!template) throw new NotFoundException('Screening template not found');
    return template;
  }

  async createScreeningTemplate(input: MentorScreeningTemplateInput, userId: string) {
    const { items, ...fields } = input;
    const created = await this.prisma.$transaction(async (tx) => {
      if (fields.isDefault) {
        await tx.mentorScreeningTemplate.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.mentorScreeningTemplate.create({
        data: {
          ...fields,
          createdById: userId,
          updatedById: userId,
          items: { create: items },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    await this.audit.logCreate(userId, 'mentor_screening_template', created.id, created);
    return created;
  }

  async updateScreeningTemplate(id: string, input: MentorScreeningTemplateInput, userId: string) {
    const existing = await this.getScreeningTemplate(id);
    const { items, ...fields } = input;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (fields.isDefault) {
        await tx.mentorScreeningTemplate.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      await tx.mentorScreeningTemplateItem.deleteMany({ where: { templateId: id } });
      return tx.mentorScreeningTemplate.update({
        where: { id },
        data: { ...fields, updatedById: userId, items: { create: items } },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await this.audit.logUpdate(userId, 'mentor_screening_template', id, existing, updated);
    return updated;
  }

  async deactivateScreeningTemplate(id: string, userId: string) {
    const existing = await this.getScreeningTemplate(id);
    await this.prisma.mentorScreeningTemplate.update({
      where: { id },
      data: { active: false, isDefault: false, updatedById: userId },
    });
    await this.audit.logUpdate(
      userId,
      'mentor_screening_template',
      id,
      { active: existing.active, isDefault: existing.isDefault },
      { active: false, isDefault: false },
    );
    return { ok: true };
  }
}
