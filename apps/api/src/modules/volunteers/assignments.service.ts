import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { VolunteerAssignmentInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ScreeningService, type MissingClearance } from './screening.service';

const names = (missing: MissingClearance[]) => missing.map((m) => m.requirement.name).join(', ');

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly screening: ScreeningService,
  ) {}

  async create(input: VolunteerAssignmentInput, userId: string) {
    const profile = await this.prisma.volunteerProfile.findFirst({
      where: { id: input.volunteerProfileId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Volunteer not found');

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

    // §6.6 clearance validation for inside assignments (inside_class type or
    // any facility-bound assignment).
    const insideAssignment = input.assignmentType === 'inside_class' || Boolean(institutionId);
    let missing: MissingClearance[] = [];
    if (insideAssignment && institutionId) {
      ({ missing } = await this.screening.computeEligibility(
        input.volunteerProfileId,
        institutionId,
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

  async update(id: string, input: Partial<VolunteerAssignmentInput>, userId: string) {
    const existing = await this.prisma.volunteerAssignment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Assignment not found');

    const updated = await this.prisma.volunteerAssignment.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'volunteer_assignment', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.prisma.volunteerAssignment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Assignment not found');

    await this.prisma.volunteerAssignment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'volunteer_assignment', id, existing);
    return { ok: true };
  }
}
