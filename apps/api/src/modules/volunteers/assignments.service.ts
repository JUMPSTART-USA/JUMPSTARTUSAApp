import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { VolunteerAssignmentInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { ScreeningService, type MissingClearance } from './screening.service';

const names = (missing: MissingClearance[]) => missing.map((m) => m.requirement.name).join(', ');

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly screening: ScreeningService,
  ) {}

  async create(input: VolunteerAssignmentInput, user: AuthenticatedUser) {
    const userId = user.id;
    const profile = await this.prisma.volunteerProfile.findFirst({
      where: { id: input.volunteerProfileId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Volunteer not found');
    // Chapter scoping (§7.2): the volunteer must be in the user's chapter for
    // EVERY assignment type — not just facility-bound ones.
    assertChapterAccess(user.chapter, profile.chapterState);

    // Resolve the facility: inside-class assignments may arrive with only the
    // class id (Zod guarantees one of institutionId/insideClassId is present).
    let institutionId = input.institutionId;
    if (!institutionId && input.insideClassId) {
      const insideClass = await this.prisma.insideClass.findFirst({
        where: { id: input.insideClassId, deletedAt: null },
        select: { institutionId: true },
      });
      if (!insideClass) throw new NotFoundException('Inside class not found');
      institutionId = insideClass.institutionId;
    }

    // Chapter scoping (§7.2): linked parents must be in the user's chapter too.
    if (institutionId) {
      const institution = await this.prisma.institution.findFirst({
        where: { id: institutionId, deletedAt: null },
        select: { state: true },
      });
      if (!institution) throw new NotFoundException('Institution not found');
      assertChapterAccess(user.chapter, institution.state);
    }
    if (input.outsideProgramId) {
      const program = await this.prisma.outsideProgram.findFirst({
        where: { id: input.outsideProgramId, deletedAt: null },
        select: { state: true },
      });
      if (!program) throw new NotFoundException('Outside program not found');
      assertChapterAccess(user.chapter, program.state);
    }
    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
        select: { chapterState: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      assertChapterAccess(user.chapter, event.chapterState);
    }

    // §6.6 clearance validation for inside assignments (inside_class type or
    // any facility-bound assignment).
    const insideAssignment = input.assignmentType === 'inside_class' || Boolean(institutionId);
    let missing: MissingClearance[] = [];
    if (insideAssignment && institutionId) {
      ({ missing } = await this.screening.computeEligibility(
        input.volunteerProfileId,
        institutionId,
        user,
      ));
      if (missing.length > 0) {
        const hard = missing.filter((m) => m.requirement.hardBlock);
        if (hard.length > 0) {
          // Hard-blocked requirements can never be overridden (§6.6).
          throw new ConflictException(
            `Volunteer is not cleared for this facility — missing hard-block requirements: ${names(hard)}`,
          );
        }
        if (!input.clearanceOverride) {
          throw new ConflictException(
            `Volunteer is missing clearances: ${names(missing)}. Soft-block — set clearanceOverride with a reason to proceed (§6.6)`,
          );
        }
      }
    }

    const assignment = await this.prisma.volunteerAssignment.create({
      data: { ...input, institutionId, createdById: userId, updatedById: userId },
    });
    // Overrides carry the missing list into the audit trail (§6.6).
    await this.audit.log({
      userId,
      action: 'create',
      entityType: 'volunteer_assignment',
      entityId: assignment.id,
      newValues: assignment,
      ...(missing.length > 0
        ? { metadata: { clearanceOverride: true, missingClearances: missing } }
        : {}),
    });
    return assignment;
  }

  async update(id: string, input: Partial<VolunteerAssignmentInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerAssignment.findFirst({
      where: { id, deletedAt: null },
      include: { volunteerProfile: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    // Chapter scoping (§7.2): derived through the volunteer's chapterState.
    assertChapterAccess(user.chapter, existing.volunteerProfile.chapterState);
    // ...and no re-parenting to another chapter: any volunteer/institution/
    // program/event the update supplies must also be in the user's chapter.
    await this.assertLinkedRefsInChapter(input, user);
    const { volunteerProfile: _volunteerProfile, ...assignmentOnly } = existing;

    const updated = await this.prisma.volunteerAssignment.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'volunteer_assignment', id, assignmentOnly, updated);
    return updated;
  }

  /**
   * Assert every chapter-bearing reference present in the input is in the
   * user's chapter (§7.2) — used by update() to block cross-chapter
   * re-parenting. create() checks the same refs inline.
   */
  private async assertLinkedRefsInChapter(
    input: Partial<VolunteerAssignmentInput>,
    user: AuthenticatedUser,
  ) {
    if (input.volunteerProfileId) {
      const profile = await this.prisma.volunteerProfile.findFirst({
        where: { id: input.volunteerProfileId, deletedAt: null },
        select: { chapterState: true },
      });
      if (!profile) throw new NotFoundException('Volunteer not found');
      assertChapterAccess(user.chapter, profile.chapterState);
    }
    let institutionId = input.institutionId;
    if (!institutionId && input.insideClassId) {
      const insideClass = await this.prisma.insideClass.findFirst({
        where: { id: input.insideClassId, deletedAt: null },
        select: { institutionId: true },
      });
      if (!insideClass) throw new NotFoundException('Inside class not found');
      institutionId = insideClass.institutionId;
    }
    if (institutionId) {
      const institution = await this.prisma.institution.findFirst({
        where: { id: institutionId, deletedAt: null },
        select: { state: true },
      });
      if (!institution) throw new NotFoundException('Institution not found');
      assertChapterAccess(user.chapter, institution.state);
    }
    if (input.outsideProgramId) {
      const program = await this.prisma.outsideProgram.findFirst({
        where: { id: input.outsideProgramId, deletedAt: null },
        select: { state: true },
      });
      if (!program) throw new NotFoundException('Outside program not found');
      assertChapterAccess(user.chapter, program.state);
    }
    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
        select: { chapterState: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      assertChapterAccess(user.chapter, event.chapterState);
    }
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerAssignment.findFirst({
      where: { id, deletedAt: null },
      include: { volunteerProfile: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    // Chapter scoping (§7.2): derived through the volunteer's chapterState.
    assertChapterAccess(user.chapter, existing.volunteerProfile.chapterState);
    const { volunteerProfile: _volunteerProfile, ...assignmentOnly } = existing;

    await this.prisma.volunteerAssignment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'volunteer_assignment', id, assignmentOnly);
    return { ok: true };
  }
}
