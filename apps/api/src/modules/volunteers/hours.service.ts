import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { HoursStatus, ListQuery, VolunteerHoursInput } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface HoursListFilters {
  volunteerProfileId?: string;
  status?: HoursStatus;
  opportunityId?: string;
  institutionId?: string;
  from?: Date;
  to?: Date;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['activityDate', 'hours', 'status', 'createdAt']);

const PERSON_NAME_SELECT = { id: true, firstName: true, lastName: true } as const;

@Injectable()
export class HoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: HoursListFilters, user: AuthenticatedUser) {
    const where: Prisma.VolunteerHoursEntryWhereInput = {
      deletedAt: null,
      // Chapter scoping (§7.2): same derivation as the volunteers list
      // (chapterState) — a scoped user only sees their chapter's entries.
      ...(user.chapter ? { volunteerProfile: { chapterState: user.chapter } } : {}),
      ...(filters.volunteerProfileId ? { volunteerProfileId: filters.volunteerProfileId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.opportunityId ? { opportunityId: filters.opportunityId } : {}),
      ...(filters.institutionId ? { institutionId: filters.institutionId } : {}),
      ...(filters.from || filters.to
        ? {
            activityDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              { opportunity: { name: { contains: query.search, mode: 'insensitive' } } },
              {
                volunteerProfile: {
                  person: { firstName: { contains: query.search, mode: 'insensitive' } },
                },
              },
              {
                volunteerProfile: {
                  person: { lastName: { contains: query.search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.VolunteerHoursEntryOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { activityDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.volunteerHoursEntry.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          volunteerProfile: { select: { id: true, person: { select: PERSON_NAME_SELECT } } },
          opportunity: { select: { id: true, name: true } },
          institution: { select: { id: true, name: true } },
          shift: { select: { id: true, shiftDate: true, startTime: true, endTime: true } },
        },
      }),
      this.prisma.volunteerHoursEntry.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Staff entry: approved on creation by default (the creator is the
   * approver); the body may set status=pending to route it through review.
   */
  async create(input: VolunteerHoursInput, user: AuthenticatedUser) {
    const userId = user.id;
    await this.assertRefs(input, user.chapter);
    // Mirror the check-out guard (the DB has no unique on shift+volunteer): a
    // manual entry must not double-count a visit check-out already recorded.
    if (input.shiftId) {
      const duplicate = await this.prisma.volunteerHoursEntry.findFirst({
        where: {
          shiftId: input.shiftId,
          volunteerProfileId: input.volunteerProfileId,
          deletedAt: null,
        },
      });
      if (duplicate) {
        throw new ConflictException('An hours entry already exists for this volunteer and shift');
      }
    }

    const entry = await this.prisma.volunteerHoursEntry.create({
      data: {
        ...input,
        ...(input.status !== 'pending' ? { approvedById: userId, approvedAt: new Date() } : {}),
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'volunteer_hours_entry', entry.id, entry);
    return entry;
  }

  /**
   * Edits, plus approve/reject semantics: a status change to approved or
   * rejected stamps the reviewer (rejected keeps approvedById as who reviewed);
   * moving back to pending clears the review stamp.
   */
  async update(id: string, input: Partial<VolunteerHoursInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerHoursEntry.findFirst({
      where: { id, deletedAt: null },
      include: { volunteerProfile: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Hours entry not found');
    // Chapter scoping (§7.2): same derivation as the volunteers list (chapterState).
    assertChapterAccess(user.chapter, existing.volunteerProfile.chapterState);
    await this.assertRefs(input, user.chapter);
    // The volunteerProfile include was for the chapter check only — keep the
    // audit payload the entry row, as before.
    const { volunteerProfile: _volunteerProfile, ...existingEntry } = existing;

    // Repointing the entry at another shift/volunteer must respect the same
    // shift+volunteer duplicate guard as creation.
    const nextShiftId = input.shiftId !== undefined ? input.shiftId : existing.shiftId;
    const nextProfileId = input.volunteerProfileId ?? existing.volunteerProfileId;
    const pairChanged =
      nextShiftId !== existing.shiftId || nextProfileId !== existing.volunteerProfileId;
    if (nextShiftId && pairChanged) {
      const duplicate = await this.prisma.volunteerHoursEntry.findFirst({
        where: {
          shiftId: nextShiftId,
          volunteerProfileId: nextProfileId,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ConflictException('An hours entry already exists for this volunteer and shift');
      }
    }

    const data: Prisma.VolunteerHoursEntryUncheckedUpdateInput = {
      ...input,
      updatedById: userId,
    };
    if (input.status && input.status !== existing.status) {
      if (input.status === 'pending') {
        data.approvedById = null;
        data.approvedAt = null;
      } else {
        data.approvedById = userId;
        data.approvedAt = new Date();
      }
    }

    const updated = await this.prisma.volunteerHoursEntry.update({ where: { id }, data });
    await this.audit.logUpdate(userId, 'volunteer_hours_entry', id, existingEntry, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerHoursEntry.findFirst({
      where: { id, deletedAt: null },
      include: { volunteerProfile: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Hours entry not found');
    // Chapter scoping (§7.2): same derivation as the volunteers list (chapterState).
    assertChapterAccess(user.chapter, existing.volunteerProfile.chapterState);
    const { volunteerProfile: _volunteerProfile, ...existingEntry } = existing;

    await this.prisma.volunteerHoursEntry.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'volunteer_hours_entry', id, existingEntry);
    return { ok: true };
  }

  private async assertRefs(
    input: {
      volunteerProfileId?: string;
      opportunityId?: string | null;
      shiftId?: string | null;
      institutionId?: string | null;
      assignmentId?: string | null;
    },
    chapter: string | null,
  ) {
    if (input.volunteerProfileId) {
      const profile = await this.prisma.volunteerProfile.findFirst({
        where: { id: input.volunteerProfileId, deletedAt: null },
      });
      if (!profile) throw new NotFoundException('Volunteer not found');
      // Chapter scoping (§7.2): the entry's volunteer must be in the user's
      // chapter — on create and on any repoint.
      assertChapterAccess(chapter, profile.chapterState);
    }
    if (input.opportunityId) {
      const opportunity = await this.prisma.volunteerOpportunity.findFirst({
        where: { id: input.opportunityId, deletedAt: null },
      });
      if (!opportunity) throw new NotFoundException('Opportunity not found');
      // Chapter scoping (§7.2): an entry cannot point at another chapter's
      // opportunity.
      assertChapterAccess(chapter, opportunity.state);
    }
    if (input.shiftId) {
      const shift = await this.prisma.volunteerShift.findFirst({
        where: { id: input.shiftId, deletedAt: null },
      });
      if (!shift) throw new NotFoundException('Shift not found');
    }
    if (input.institutionId) {
      const institution = await this.prisma.institution.findFirst({
        where: { id: input.institutionId, deletedAt: null },
      });
      if (!institution) throw new NotFoundException('Institution not found');
      // Chapter scoping (§7.2): an entry cannot point at another chapter's
      // facility.
      assertChapterAccess(chapter, institution.state);
    }
    if (input.assignmentId) {
      const assignment = await this.prisma.volunteerAssignment.findFirst({
        where: { id: input.assignmentId, deletedAt: null },
      });
      if (!assignment) throw new NotFoundException('Assignment not found');
    }
  }
}
