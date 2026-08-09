import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  ListQuery,
  MentorScreeningCriterionUpdateInput,
  MentorScreeningInput,
  MentorScreeningStage,
  MentorScreeningStepInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

const SORTABLE = new Set(['stage', 'createdAt', 'updatedAt', 'approvedAt']);

// §6.7 boundary: the pipeline shows WHO the applicant is and THAT they are an
// alumnus — never their participant history. Only the profile's existence is
// selected, and it is reduced to a boolean before leaving the service.
const VOLUNTEER_SUMMARY = {
  select: {
    id: true,
    chapterState: true,
    person: {
      select: {
        firstName: true,
        lastName: true,
        participantProfile: { select: { id: true } },
      },
    },
  },
} as const;

type ScreeningWithVolunteer = Prisma.MentorScreeningGetPayload<{
  include: { volunteerProfile: typeof VOLUNTEER_SUMMARY };
}>;

function toView<T extends ScreeningWithVolunteer>(screening: T) {
  const { volunteerProfile, ...rest } = screening;
  return {
    ...rest,
    volunteerName: `${volunteerProfile.person.firstName} ${volunteerProfile.person.lastName}`,
    isAlumni: volunteerProfile.person.participantProfile !== null,
  };
}

@Injectable()
export class MentorScreeningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Open a screening. Criteria are SNAPSHOTTED from the default template
   * (label/sortOrder/required) so later template edits never rewrite an
   * in-flight or historical screening (§6.7, mirrors §6.5 checklists).
   */
  async create(input: MentorScreeningInput, user: AuthenticatedUser) {
    const userId = user.id;
    const volunteer = await this.prisma.volunteerProfile.findFirst({
      where: { id: input.volunteerProfileId, deletedAt: null },
    });
    if (!volunteer) throw new BadRequestException('Volunteer profile not found');
    // Chapter scoping (§7.2): the screening inherits the volunteer's chapter.
    assertChapterAccess(user.chapter, volunteer.chapterState);

    // Approval has side effects (mentor flag) — it must go through PATCH, the
    // single approval path, never through create.
    if (input.stage === 'approved') {
      throw new BadRequestException(
        'Screenings cannot be created already approved — move the screening to the approved stage instead',
      );
    }

    const open = await this.prisma.mentorScreening.findFirst({
      where: {
        volunteerProfileId: input.volunteerProfileId,
        stage: { notIn: ['approved', 'rejected', 'withdrawn'] },
      },
    });
    if (open) {
      throw new ConflictException('This volunteer already has a screening in progress');
    }

    const template = await this.prisma.mentorScreeningTemplate.findFirst({
      where: { isDefault: true, active: true },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    const screening = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mentorScreening.create({
        data: {
          ...input,
          templateId: template?.id ?? null,
          createdById: userId,
          updatedById: userId,
        },
      });
      if (template && template.items.length > 0) {
        await tx.mentorScreeningCriterion.createMany({
          data: template.items.map((item) => ({
            screeningId: created.id,
            label: item.label,
            sortOrder: item.sortOrder,
            required: item.required,
          })),
        });
      }
      return created;
    });

    await this.audit.logCreate(userId, 'mentor_screening', screening.id, screening);
    return this.get(screening.id, user);
  }

  /** Pipeline/kanban feed (§6.7 workflow 3). */
  async list(query: ListQuery, filters: { stage?: MentorScreeningStage; state?: string }) {
    const where: Prisma.MentorScreeningWhereInput = {
      ...(filters.stage ? { stage: filters.stage } : {}),
      ...(filters.state || query.search
        ? {
            volunteerProfile: {
              // Chapter scoping (§7.2): derived through the volunteer profile.
              ...(filters.state ? { chapterState: filters.state } : {}),
              ...(query.search
                ? {
                    person: {
                      OR: [
                        { firstName: { contains: query.search, mode: 'insensitive' } },
                        { lastName: { contains: query.search, mode: 'insensitive' } },
                      ],
                    },
                  }
                : {}),
            },
          }
        : {}),
    };

    const orderBy: Prisma.MentorScreeningOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'asc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.mentorScreening.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          volunteerProfile: VOLUNTEER_SUMMARY,
          criteria: { select: { status: true } },
        },
      }),
      this.prisma.mentorScreening.count({ where }),
    ]);

    const items = rows.map((row) => {
      const { criteria, ...screening } = row;
      return {
        ...toView(screening),
        criteriaTotal: criteria.length,
        criteriaCompleted: criteria.filter((c) => c.status === 'completed').length,
      };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const screening = await this.prisma.mentorScreening.findUnique({
      where: { id },
      include: {
        volunteerProfile: VOLUNTEER_SUMMARY,
        criteria: { orderBy: { sortOrder: 'asc' } },
        steps: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!screening) throw new NotFoundException('Mentor screening not found');
    // Chapter scoping (§7.2): same derivation as the list filter (volunteer).
    assertChapterAccess(user.chapter, screening.volunteerProfile.chapterState);
    return toView(screening);
  }

  /**
   * Stage moves. Entering 'approved' is the §6.7 workflow-3 gate: stamps
   * approvedAt/approvedById and flips volunteerProfile.isMentor with any
   * conditions recorded as the mentorStatus restriction summary — atomically.
   */
  async update(
    id: string,
    input: Partial<Omit<MentorScreeningInput, 'volunteerProfileId'>>,
    user: AuthenticatedUser,
  ) {
    const userId = user.id;
    const withVolunteer = await this.prisma.mentorScreening.findUnique({
      where: { id },
      include: { volunteerProfile: { select: { chapterState: true } } },
    });
    if (!withVolunteer) throw new NotFoundException('Mentor screening not found');
    // Chapter scoping (§7.2): derived through the volunteer profile — checked
    // before the approve transaction flips volunteerProfile.isMentor.
    assertChapterAccess(user.chapter, withVolunteer.volunteerProfile.chapterState);
    const { volunteerProfile: _volunteer, ...existing } = withVolunteer;

    const becomingApproved = input.stage === 'approved' && existing.stage !== 'approved';
    const volunteerBefore = becomingApproved
      ? await this.prisma.volunteerProfile.findUnique({
          where: { id: existing.volunteerProfileId },
          select: { isMentor: true, mentorStatus: true },
        })
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const screening = await tx.mentorScreening.update({
        where: { id },
        data: {
          ...input,
          ...(becomingApproved ? { approvedAt: new Date(), approvedById: userId } : {}),
          updatedById: userId,
        },
      });
      if (becomingApproved) {
        await tx.volunteerProfile.update({
          where: { id: existing.volunteerProfileId },
          data: {
            isMentor: true,
            mentorStatus: screening.conditions,
            updatedById: userId,
          },
        });
      }
      return screening;
    });

    await this.audit.logUpdate(userId, 'mentor_screening', id, existing, updated);
    if (becomingApproved) {
      await this.audit.logUpdate(
        userId,
        'volunteer_profile',
        existing.volunteerProfileId,
        volunteerBefore,
        { isMentor: true, mentorStatus: updated.conditions },
      );
    }
    return this.get(id, user);
  }

  /** Record a stage outcome (interview passed, references waived, …). */
  async addStep(screeningId: string, input: MentorScreeningStepInput, user: AuthenticatedUser) {
    const userId = user.id;
    const screening = await this.prisma.mentorScreening.findUnique({
      where: { id: screeningId },
      include: { volunteerProfile: { select: { chapterState: true } } },
    });
    if (!screening) throw new NotFoundException('Mentor screening not found');
    // Chapter scoping (§7.2): derived through the screening's volunteer.
    assertChapterAccess(user.chapter, screening.volunteerProfile.chapterState);

    const step = await this.prisma.mentorScreeningStep.create({
      data: { ...input, screeningId },
    });
    await this.audit.logCreate(userId, 'mentor_screening_step', step.id, step);
    return step;
  }

  async updateCriterion(
    id: string,
    input: MentorScreeningCriterionUpdateInput,
    user: AuthenticatedUser,
  ) {
    const userId = user.id;
    const withScreening = await this.prisma.mentorScreeningCriterion.findUnique({
      where: { id },
      include: {
        screening: { select: { volunteerProfile: { select: { chapterState: true } } } },
      },
    });
    if (!withScreening) throw new NotFoundException('Screening criterion not found');
    // Chapter scoping (§7.2): derived through the screening's volunteer.
    assertChapterAccess(user.chapter, withScreening.screening.volunteerProfile.chapterState);
    const { screening: _screening, ...existing } = withScreening;

    // Completion stamps are set on the transition, not on every save.
    const completing = input.status === 'completed' && existing.status !== 'completed';
    const uncompleting = input.status !== 'completed' && existing.status === 'completed';

    const updated = await this.prisma.mentorScreeningCriterion.update({
      where: { id },
      data: {
        ...input,
        ...(completing ? { completedAt: new Date(), completedById: userId } : {}),
        ...(uncompleting ? { completedAt: null, completedById: null } : {}),
      },
    });
    await this.audit.logUpdate(userId, 'mentor_screening_criterion', id, existing, updated);
    return updated;
  }
}
