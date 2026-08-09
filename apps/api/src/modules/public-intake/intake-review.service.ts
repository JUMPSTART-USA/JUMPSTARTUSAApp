import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@jumpstart/database';
import {
  INTAKE_STATUSES,
  isChapterState,
  type ChapterState,
  type IntakeReviewInput,
  type IntakeStatus,
  type ListQuery,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { findDuplicateCandidates } from './duplicate-candidates.util';

export interface QueueListFilters {
  status?: IntakeStatus;
  state?: string;
}

/**
 * Review body for the two public-form queues: legacy rows may predate the
 * required chapter field, so the reviewer can (and for null-state rows must)
 * pick the chapter explicitly (§7.2).
 */
export type ReviewWithChapterInput = IntakeReviewInput & { state?: ChapterState };

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked. Queues default to oldest-first (FIFO review).
const SORTABLE = new Set(['submittedAt', 'status', 'reviewedAt']);

const ALUMNI_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const DAY_MS = 86_400_000;

@Injectable()
export class IntakeReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Queue listings (each item decorated for link-instead-of-create, §6.11) ──

  async listVolunteerApplications(query: ListQuery, filters: QueueListFilters) {
    const where: Prisma.VolunteerApplicationWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      // Chapter scoping (§7.2): own column, straight from the public form.
      // Legacy null-state rows stay visible to all-chapters staff only.
      ...(filters.state ? { state: filters.state } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.volunteerApplication.findMany({
        where,
        orderBy: this.orderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.volunteerApplication.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async (item) => ({
        ...item,
        duplicateCandidates: await findDuplicateCandidates(this.prisma, {
          firstName: item.firstName,
          lastName: item.lastName,
          phone: item.phone,
          email: item.email,
        }),
      })),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async listReferrals(query: ListQuery, filters: QueueListFilters) {
    const where: Prisma.ReferralInboxItemWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      // Chapter scoping (§7.2): own column, straight from the public form.
      ...(filters.state ? { state: filters.state } : {}),
      ...(query.search
        ? {
            OR: [
              { subjectFirstName: { contains: query.search, mode: 'insensitive' } },
              { subjectLastName: { contains: query.search, mode: 'insensitive' } },
              { referrerName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.referralInboxItem.findMany({
        where,
        orderBy: this.orderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.referralInboxItem.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async (item) => ({
        ...item,
        duplicateCandidates: await findDuplicateCandidates(this.prisma, {
          firstName: item.subjectFirstName,
          lastName: item.subjectLastName,
          phone: item.subjectPhone,
        }),
      })),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Alumni updates arrive token-linked to a known participant, so instead of
   * duplicate candidates they carry the participant/person summary the
   * reviewer needs to sanity-check the update.
   */
  async listAlumniUpdates(query: ListQuery, filters: QueueListFilters) {
    const where: Prisma.AlumniUpdateWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      // Chapter scoping (§7.2): derived through the required participant.
      ...(filters.state ? { participantProfile: { chapterState: filters.state } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.alumniUpdate.findMany({
        where,
        orderBy: this.orderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          participantProfile: {
            select: {
              id: true,
              participantNumber: true,
              alumniStatus: true,
              chapterState: true, // the update's chapter (§7.2)
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                  primaryPhone: true,
                  primaryEmail: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.alumniUpdate.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  // ── Review actions ──────────────────────────────────────────────────────────

  /**
   * Volunteer application review (§6.11): approve creates person + volunteer
   * profile (status applicant → the §6.6 screening pipeline starts there) or
   * links an existing person; reject/spam only flips status — rows keep their
   * audit trail.
   */
  async reviewVolunteerApplication(
    id: string,
    input: ReviewWithChapterInput,
    user: AuthenticatedUser,
  ) {
    const app = await this.prisma.volunteerApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Volunteer application not found');
    this.assertReviewable(app.status);
    // Chapter scoping (§7.2): own column, or the reviewer's pick for legacy rows.
    const chapterState = this.resolveQueueChapter(app.state, input.state, user);

    if (input.action !== 'approve') {
      const updated = await this.prisma.volunteerApplication.update({
        where: { id },
        data: {
          status: input.action === 'reject' ? 'rejected' : 'spam',
          ...this.reviewStamp(input, user, chapterState),
        },
      });
      await this.audit.logUpdate(user.id, 'volunteer_application', id, app, updated);
      return updated;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let personId: string;
      let createdPerson = null;
      let volunteerProfile;
      let volunteerProfileCreated = false;

      if (input.existingPersonId) {
        const person = await tx.person.findFirst({
          where: { id: input.existingPersonId, deletedAt: null },
          include: { volunteerProfile: true },
        });
        if (!person) throw new BadRequestException('existingPersonId does not match an active person');
        // Chapter scoping (§7.2): no linking this submission to another
        // chapter's volunteer (their profile carries the chapter).
        assertChapterAccess(user.chapter, person.volunteerProfile?.chapterState);
        personId = person.id;
        if (person.volunteerProfile && !person.volunteerProfile.deletedAt) {
          volunteerProfile = person.volunteerProfile; // already a volunteer — just link
        } else if (person.volunteerProfile) {
          // personId is unique on volunteer_profiles: restore the soft-deleted
          // row instead of creating a colliding second one.
          volunteerProfile = await tx.volunteerProfile.update({
            where: { id: person.volunteerProfile.id },
            data: { deletedAt: null, status: 'applicant', updatedById: user.id },
          });
          volunteerProfileCreated = true;
        } else {
          volunteerProfile = await tx.volunteerProfile.create({
            data: this.volunteerProfileData(app, person.id, user.id, chapterState),
          });
          volunteerProfileCreated = true;
        }
      } else {
        const person = await tx.person.create({
          data: {
            firstName: app.firstName,
            lastName: app.lastName,
            primaryEmail: app.email,
            primaryPhone: app.phone,
            city: app.city,
            state: app.state,
            createdById: user.id,
            updatedById: user.id,
          },
        });
        createdPerson = person;
        personId = person.id;
        volunteerProfile = await tx.volunteerProfile.create({
          data: this.volunteerProfileData(app, person.id, user.id, chapterState),
        });
        volunteerProfileCreated = true;
      }

      const updatedApp = await tx.volunteerApplication.update({
        where: { id },
        data: {
          status: 'approved',
          linkedPersonId: personId,
          ...this.reviewStamp(input, user, chapterState),
        },
      });
      return { updatedApp, createdPerson, volunteerProfile, volunteerProfileCreated };
    });

    if (result.createdPerson) {
      await this.audit.logCreate(user.id, 'person', result.createdPerson.id, result.createdPerson);
    }
    if (result.volunteerProfileCreated) {
      await this.audit.logCreate(
        user.id,
        'volunteer_profile',
        result.volunteerProfile.id,
        result.volunteerProfile,
      );
    }
    await this.audit.logUpdate(user.id, 'volunteer_application', id, app, result.updatedApp);
    return { ...result.updatedApp, volunteerProfileId: result.volunteerProfile.id };
  }

  /**
   * Referral review (§6.11): approve creates person + participant profile at
   * outsideStatus 'intake' (or links an existing person) and instantiates the
   * default onboarding checklist (§6.5). Rejected/spam rows only flip status —
   * they are purged later per the §7.6 retention schedule (separate job).
   */
  async reviewReferral(id: string, input: ReviewWithChapterInput, user: AuthenticatedUser) {
    const referral = await this.prisma.referralInboxItem.findUnique({ where: { id } });
    if (!referral) throw new NotFoundException('Referral not found');
    this.assertReviewable(referral.status);
    // Chapter scoping (§7.2): own column, or the reviewer's pick for legacy rows.
    const chapterState = this.resolveQueueChapter(referral.state, input.state, user);

    if (input.action !== 'approve') {
      const updated = await this.prisma.referralInboxItem.update({
        where: { id },
        data: {
          status: input.action === 'reject' ? 'rejected' : 'spam',
          ...this.reviewStamp(input, user, chapterState),
        },
      });
      await this.audit.logUpdate(user.id, 'referral_inbox_item', id, referral, updated);
      return updated;
    }

    // Linking to a person who is ALREADY a participant needs no new profile,
    // number, or checklist — their case file continues as-is.
    let existingProfileId: string | null = null;
    if (input.existingPersonId) {
      const person = await this.prisma.person.findFirst({
        where: { id: input.existingPersonId, deletedAt: null },
        include: {
          participantProfile: { select: { id: true, deletedAt: true, chapterState: true } },
        },
      });
      if (!person) throw new BadRequestException('existingPersonId does not match an active person');
      // Chapter scoping (§7.2): no linking this referral to another chapter's
      // participant (their profile carries the chapter).
      assertChapterAccess(user.chapter, person.participantProfile?.chapterState);
      if (person.participantProfile && !person.participantProfile.deletedAt) {
        existingProfileId = person.participantProfile.id;
      }
    }

    if (existingProfileId) {
      const updated = await this.prisma.referralInboxItem.update({
        where: { id },
        data: {
          status: 'approved',
          linkedParticipantProfileId: existingProfileId,
          ...this.reviewStamp(input, user, chapterState),
        },
      });
      await this.audit.logUpdate(user.id, 'referral_inbox_item', id, referral, updated);
      return updated;
    }

    // participantNumber P-<year>-<seq> — same pattern as the participants
    // module. Concurrent creates can collide on the unique index, so retry
    // with a bumped sequence a few times.
    const year = new Date().getFullYear();
    for (let attempt = 0; ; attempt++) {
      const participantNumber = await this.nextParticipantNumber(year, attempt);
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          let personId: string;
          let createdPerson = null;
          if (input.existingPersonId) {
            personId = input.existingPersonId; // validated active above
          } else {
            const person = await tx.person.create({
              data: {
                firstName: referral.subjectFirstName,
                lastName: referral.subjectLastName,
                primaryPhone: referral.subjectPhone,
                state: referral.state,
                createdById: user.id,
                updatedById: user.id,
              },
            });
            createdPerson = person;
            personId = person.id;
          }

          const intakeDate = new Date();
          const profile = await tx.participantProfile.create({
            data: {
              personId,
              participantNumber,
              // Chapter scoping (§7.2): the new participant belongs to the
              // referral's chapter (person.state stays a mailing address).
              chapterState,
              outsideStatus: 'intake',
              intakeDate,
              createdById: user.id,
              updatedById: user.id,
            },
          });
          // Cohort/outcome reports read from the append-only history, never
          // from the mutable current-status columns (§4.1.6).
          await tx.participantStatusHistory.create({
            data: {
              participantProfileId: profile.id,
              domain: 'outside_status',
              fromValue: null,
              toValue: 'intake',
              effectiveDate: intakeDate,
              reason: 'Approved from referral inbox',
              changedById: user.id,
            },
          });

          // Default onboarding checklist, snapshot of the template at
          // instantiation (§6.5) — templates are mutable, history is not.
          const template = await tx.onboardingChecklistTemplate.findFirst({
            where: { isDefault: true, active: true },
            include: { items: { orderBy: { sortOrder: 'asc' } } },
          });
          if (template) {
            await tx.onboardingChecklist.create({
              data: {
                participantProfileId: profile.id,
                templateId: template.id,
                createdById: user.id,
                updatedById: user.id,
                items: {
                  create: template.items.map((item) => ({
                    label: item.label,
                    sortOrder: item.sortOrder,
                    required: item.required,
                    templateItemId: item.id,
                  })),
                },
              },
            });
          }

          const updatedReferral = await tx.referralInboxItem.update({
            where: { id },
            data: {
              status: 'approved',
              linkedParticipantProfileId: profile.id,
              ...this.reviewStamp(input, user, chapterState),
            },
          });
          return { updatedReferral, createdPerson, profile };
        });

        if (result.createdPerson) {
          await this.audit.logCreate(user.id, 'person', result.createdPerson.id, result.createdPerson);
        }
        await this.audit.logCreate(user.id, 'participant_profile', result.profile.id, result.profile);
        await this.audit.logUpdate(user.id, 'referral_inbox_item', id, referral, result.updatedReferral);
        return result.updatedReferral;
      } catch (err) {
        const isUnique =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (isUnique && attempt < 3) continue;
        throw err;
      }
    }
  }

  /**
   * Alumni-update review: approve applies contact changes to the person, logs
   * an alumni engagement, and maps the self-reported statuses onto the
   * pending outcome check-in wave (§6.7, §9.3) as method 'self_report'.
   */
  async reviewAlumniUpdate(id: string, input: IntakeReviewInput, user: AuthenticatedUser) {
    const update = await this.prisma.alumniUpdate.findUnique({
      where: { id },
      include: { participantProfile: { include: { person: true } } },
    });
    if (!update) throw new NotFoundException('Alumni update not found');
    this.assertReviewable(update.status);
    // Chapter scoping (§7.2): derived through the required participant.
    assertChapterAccess(user.chapter, update.participantProfile.chapterState);

    if (input.action !== 'approve') {
      const updated = await this.prisma.alumniUpdate.update({
        where: { id },
        data: {
          status: input.action === 'reject' ? 'rejected' : 'spam',
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      await this.audit.logUpdate(user.id, 'alumni_update', id, update, updated);
      return updated;
    }

    const person = update.participantProfile.person;
    const personData: Prisma.PersonUpdateInput = {};
    if (update.newPhone) personData.primaryPhone = update.newPhone;
    if (update.newEmail) {
      personData.primaryEmail = update.newEmail;
      personData.emailBouncedAt = null; // fresh address resets deliverability
    }
    if (update.newAddress) {
      // Self-reported address is free text: stored on addressLine1 for staff
      // to normalize; stale line2 cleared, city/state/zip left for review.
      personData.addressLine1 = update.newAddress;
      personData.addressLine2 = null;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let updatedPerson = null;
      if (Object.keys(personData).length > 0) {
        updatedPerson = await tx.person.update({
          where: { id: person.id },
          data: { ...personData, updatedById: user.id },
        });
      }

      const engagement = await tx.alumniEngagement.create({
        data: {
          participantProfileId: update.participantProfileId,
          engagementType: 'other',
          engagementDate: update.submittedAt,
          notes: 'Self-reported update via alumni form',
          createdById: user.id,
          updatedById: user.id,
        },
      });

      // "Most recent" pending wave = the latest-due incomplete check-in whose
      // due date is on/before the submission; future waves stay open.
      let checkin = null;
      if (update.employmentStatus || update.housingStatus) {
        const pending = await tx.outcomeCheckin.findFirst({
          where: {
            participantProfileId: update.participantProfileId,
            completedDate: null,
            dueDate: { lte: update.submittedAt },
          },
          orderBy: { dueDate: 'desc' },
        });
        if (pending) {
          checkin = await tx.outcomeCheckin.update({
            where: { id: pending.id },
            data: {
              completedDate: update.submittedAt,
              method: 'self_report',
              ...(update.employmentStatus ? { employmentStatus: update.employmentStatus } : {}),
              ...(update.housingStatus ? { housingStatus: update.housingStatus } : {}),
              updatedById: user.id,
            },
          });
        }
      }

      const updatedRow = await tx.alumniUpdate.update({
        where: { id },
        data: { status: 'approved', reviewedById: user.id, reviewedAt: new Date() },
      });
      return { updatedRow, updatedPerson, engagement, checkin };
    });

    if (result.updatedPerson) {
      await this.audit.logUpdate(user.id, 'person', person.id, person, result.updatedPerson);
    }
    await this.audit.logCreate(user.id, 'alumni_engagement', result.engagement.id, result.engagement);
    if (result.checkin) {
      await this.audit.logUpdate(user.id, 'outcome_checkin', result.checkin.id, null, result.checkin);
    }
    await this.audit.logUpdate(user.id, 'alumni_update', id, update, result.updatedRow);
    return result.updatedRow;
  }

  // ── Queue SLA feed (§6.11: "referrals waiting > 3 days" dashboards) ─────────

  /** `userChapter` is `user.chapter` — null (all chapters) counts everything. */
  async summary(userChapter: string | null) {
    // Chapter scoping (§7.2): the same per-queue predicates the lists use — own
    // column for the two public-form queues, participant for alumni updates.
    const queueWhere: { state?: string } = userChapter ? { state: userChapter } : {};
    const alumniWhere: { participantProfile?: { chapterState: string } } = userChapter
      ? { participantProfile: { chapterState: userChapter } }
      : {};

    const [vaCounts, refCounts, auCounts, vaOldest, refOldest, auOldest] =
      await Promise.all([
        this.prisma.volunteerApplication.groupBy({
          by: ['status'],
          where: queueWhere,
          _count: { _all: true },
          orderBy: { status: 'asc' },
        }),
        this.prisma.referralInboxItem.groupBy({
          by: ['status'],
          where: queueWhere,
          _count: { _all: true },
          orderBy: { status: 'asc' },
        }),
        this.prisma.alumniUpdate.groupBy({
          by: ['status'],
          where: alumniWhere,
          _count: { _all: true },
          orderBy: { status: 'asc' },
        }),
        this.prisma.volunteerApplication.findFirst({
          where: { status: 'pending', ...queueWhere },
          orderBy: { submittedAt: 'asc' },
          select: { submittedAt: true },
        }),
        this.prisma.referralInboxItem.findFirst({
          where: { status: 'pending', ...queueWhere },
          orderBy: { submittedAt: 'asc' },
          select: { submittedAt: true },
        }),
        this.prisma.alumniUpdate.findFirst({
          where: { status: 'pending', ...alumniWhere },
          orderBy: { submittedAt: 'asc' },
          select: { submittedAt: true },
        }),
      ]);

    return {
      volunteerApplications: this.queueSummary(vaCounts, vaOldest),
      referrals: this.queueSummary(refCounts, refOldest),
      alumniUpdates: this.queueSummary(auCounts, auOldest),
    };
  }

  // ── Alumni form tokens (§6.7: tokenized self-update links) ─────────────────

  async createAlumniFormToken(participantProfileId: string, user: AuthenticatedUser) {
    const participant = await this.prisma.participantProfile.findFirst({
      where: { id: participantProfileId, deletedAt: null },
      select: { id: true, chapterState: true },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    // Chapter scoping (§7.2): no minting self-update links for another
    // chapter's alum — the token inherits the participant's chapter.
    assertChapterAccess(user.chapter, participant.chapterState);

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ALUMNI_TOKEN_TTL_MS);
    const row = await this.prisma.alumniFormToken.create({
      data: { participantProfileId, token, expiresAt },
    });

    // The token is a bearer secret — audit the issuance, never the value.
    await this.audit.log({
      userId: user.id,
      action: 'create',
      entityType: 'alumni_form_token',
      entityId: row.id,
      newValues: { participantProfileId, expiresAt },
    });
    // Returned exactly once; only the hashless token row lives in the DB.
    return { id: row.id, token, expiresAt };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private orderBy(query: ListQuery) {
    return query.sortBy && SORTABLE.has(query.sortBy)
      ? { [query.sortBy]: query.sortDir }
      : { submittedAt: 'asc' as const };
  }

  private assertReviewable(status: IntakeStatus | string) {
    if (status !== 'pending' && status !== 'in_review') {
      throw new ConflictException('This submission has already been reviewed');
    }
  }

  /**
   * Chapter of a queue row (§7.2): its own `state` when the public form
   * supplied one, otherwise the chapter the reviewer picked — legacy rows
   * predate the required form field and cannot be routed without a decision.
   */
  private resolveQueueChapter(
    itemState: string | null,
    picked: ChapterState | undefined,
    user: AuthenticatedUser,
  ): ChapterState {
    const chapter = itemState && isChapterState(itemState) ? itemState : picked;
    if (!chapter) throw new BadRequestException('Select the chapter for this submission');
    assertChapterAccess(user.chapter, chapter);
    return chapter;
  }

  /** Reviewing also settles the row's chapter, so it is stamped here. */
  private reviewStamp(input: IntakeReviewInput, user: AuthenticatedUser, chapterState: string) {
    return {
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNotes: input.reviewNotes ?? null,
      state: chapterState,
    };
  }

  private volunteerProfileData(
    app: { interestAreas: string[]; availability: string | null; churchAffiliation: string | null },
    personId: string,
    userId: string,
    chapterState: string,
  ): Prisma.VolunteerProfileUncheckedCreateInput {
    return {
      personId,
      chapterState,
      status: 'applicant',
      volunteerRoles: app.interestAreas,
      availability: app.availability,
      churchAffiliation: app.churchAffiliation,
      createdById: userId,
      updatedById: userId,
    };
  }

  private queueSummary(
    counts: Array<{ status: IntakeStatus | string; _count: { _all: number } }>,
    oldestPending: { submittedAt: Date } | null,
  ) {
    const byStatus: Record<string, number> = Object.fromEntries(
      INTAKE_STATUSES.map((s) => [s, 0]),
    );
    for (const row of counts) byStatus[row.status] = row._count._all;
    return {
      byStatus,
      oldestPendingSubmittedAt: oldestPending?.submittedAt ?? null,
      oldestPendingAgeDays: oldestPending
        ? Math.floor((Date.now() - oldestPending.submittedAt.getTime()) / DAY_MS)
        : null,
    };
  }

  private async nextParticipantNumber(year: number, bump: number) {
    const created = await this.prisma.participantProfile.count({
      where: { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    });
    return `P-${year}-${String(created + 1 + bump).padStart(5, '0')}`;
  }
}
