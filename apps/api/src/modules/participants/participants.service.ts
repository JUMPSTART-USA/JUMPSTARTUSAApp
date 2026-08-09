import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@jumpstart/database';
import type {
  AlumniStatus,
  GraduationInput,
  InsideStatus,
  ListQuery,
  OutsideStatus,
  ParticipantCreateInput,
  ParticipantUpdateInput,
  ReleaseInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface ParticipantListFilters {
  insideStatus?: InsideStatus;
  outsideStatus?: OutsideStatus;
  alumniStatus?: AlumniStatus;
  state?: string;
  assignedCaseManagerId?: string;
  /** Participants whose ACTIVE inside location is this institution. */
  institutionId?: string;
}

export interface DuplicateCheckInput {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  phone?: string;
  email?: string;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked. 'lastName' sorts through the person relation.
const SORTABLE = new Set([
  'participantNumber',
  'insideStatus',
  'outsideStatus',
  'alumniStatus',
  'intakeDate',
  'releaseDate',
  'graduationDate',
  'createdAt',
]);

/** profile column → status-history domain (§6.1: append-only transition log). */
const STATUS_DOMAINS = [
  ['insideStatus', 'inside_status'],
  ['outsideStatus', 'outside_status'],
  ['phase', 'phase'],
  ['alumniStatus', 'alumni_status'],
] as const;

const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: ParticipantListFilters) {
    const where: Prisma.ParticipantProfileWhereInput = {
      deletedAt: null,
      person: { deletedAt: null },
      // Chapter scoping (§7.2): own chapterState column — person.state is mail.
      ...(filters.state ? { chapterState: filters.state } : {}),
      ...(filters.insideStatus ? { insideStatus: filters.insideStatus } : {}),
      ...(filters.outsideStatus ? { outsideStatus: filters.outsideStatus } : {}),
      ...(filters.alumniStatus ? { alumniStatus: filters.alumniStatus } : {}),
      ...(filters.assignedCaseManagerId
        ? { assignedCaseManagerId: filters.assignedCaseManagerId }
        : {}),
      ...(filters.institutionId
        ? {
            insideLocations: {
              some: { institutionId: filters.institutionId, status: 'active', deletedAt: null },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { participantNumber: { contains: query.search, mode: 'insensitive' } },
              { person: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { person: { lastName: { contains: query.search, mode: 'insensitive' } } },
              { person: { preferredName: { contains: query.search, mode: 'insensitive' } } },
              { person: { primaryPhone: { contains: query.search } } },
              { person: { primaryEmail: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ParticipantProfileOrderByWithRelationInput =
      query.sortBy === 'lastName'
        ? { person: { lastName: query.sortDir } }
        : query.sortBy && SORTABLE.has(query.sortBy)
          ? { [query.sortBy]: query.sortDir }
          : { person: { lastName: 'asc' } };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.participantProfile.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
              primaryPhone: true,
              primaryEmail: true,
              city: true,
              state: true,
            },
          },
          assignedCaseManager: { select: { id: true, firstName: true, lastName: true } },
          // Current inside location (§6.1): at most one active row exists.
          insideLocations: {
            where: { status: 'active', deletedAt: null },
            select: { institution: { select: { id: true, name: true } } },
            take: 1,
          },
        },
      }),
      this.prisma.participantProfile.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * §5 duplicate prevention: candidate matches returned before any
   * person-creating flow — case-insensitive full-name match, same phone/email,
   * or same DOB + last name — with the roles each candidate already holds.
   */
  async duplicateCheck(input: DuplicateCheckInput, user: AuthenticatedUser) {
    const or: Prisma.PersonWhereInput[] = [
      {
        firstName: { equals: input.firstName, mode: 'insensitive' },
        lastName: { equals: input.lastName, mode: 'insensitive' },
      },
    ];
    if (input.phone) or.push({ primaryPhone: input.phone });
    if (input.email) or.push({ primaryEmail: { equals: input.email, mode: 'insensitive' } });
    if (input.dateOfBirth) {
      or.push({
        dateOfBirth: input.dateOfBirth,
        lastName: { equals: input.lastName, mode: 'insensitive' },
      });
    }

    const matches = await this.prisma.person.findMany({
      where: {
        deletedAt: null,
        OR: or,
        // Chapter scoping (§7.2): scoped users only get candidates they could
        // act on — their chapter's profiles or profile-less persons; the
        // cross-chapter dedupe stays with all-chapters users.
        ...(user.chapter
          ? {
              AND: [
                {
                  OR: [
                    { participantProfile: { chapterState: user.chapter } },
                    { volunteerProfile: { chapterState: user.chapter } },
                    {
                      participantProfile: { is: null },
                      volunteerProfile: { is: null },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        dateOfBirth: true,
        primaryPhone: true,
        primaryEmail: true,
        city: true,
        state: true,
        participantProfile: { select: { id: true, participantNumber: true, deletedAt: true } },
        volunteerProfile: { select: { id: true, deletedAt: true } },
        user: { select: { id: true } },
      },
      take: 20,
    });

    return {
      candidates: matches.map(
        ({ participantProfile, volunteerProfile, user: staffUser, ...person }) => ({
          ...person,
          participantProfileId:
            participantProfile && !participantProfile.deletedAt ? participantProfile.id : null,
          participantNumber:
            participantProfile && !participantProfile.deletedAt
              ? participantProfile.participantNumber
              : null,
          profileTypes: [
            ...(participantProfile && !participantProfile.deletedAt ? ['participant'] : []),
            ...(volunteerProfile && !volunteerProfile.deletedAt ? ['volunteer'] : []),
            ...(staffUser ? ['staff'] : []),
          ],
        }),
      ),
    };
  }

  /** Create person + participant profile in one transaction (§6.1 workflow 1). */
  async create(input: ParticipantCreateInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): stamp the chapter from the creator — a scoped
    // user gets their own chapter, an all-chapters user must pick one.
    // person.state is the mailing address, never the chapter.
    const chapterState = resolveCreateChapter(user.chapter, input.chapterState);
    if (!input.confirmNotDuplicate) {
      const { candidates } = await this.duplicateCheck(
        {
          firstName: input.person.firstName,
          lastName: input.person.lastName,
          dateOfBirth: input.person.dateOfBirth,
          phone: input.person.primaryPhone,
          email: input.person.primaryEmail,
        },
        user,
      );
      if (candidates.length > 0) {
        throw new ConflictException({
          message:
            'Possible duplicate persons found. Review the candidates, then resubmit with confirmNotDuplicate to proceed.',
          candidates,
        });
      }
    }

    await this.assertCaseManagerExists(input.profile.assignedCaseManagerId);

    // participantNumber P-<year>-<seq> (§5): sequence = profiles created this
    // year + 1. Concurrent creates can collide on the unique index, so retry
    // with a bumped sequence a few times.
    const year = new Date().getFullYear();
    for (let attempt = 0; ; attempt++) {
      const participantNumber = await this.nextParticipantNumber(year, attempt);
      try {
        const profile = await this.prisma.$transaction(async (tx) => {
          const person = await tx.person.create({
            data: {
              ...input.person,
              // TCPA: record when the SMS opt-in was captured
              smsConsentAt: input.person.smsOk ? new Date() : undefined,
              createdById: userId,
              updatedById: userId,
            },
          });
          const created = await tx.participantProfile.create({
            data: {
              ...input.profile,
              chapterState,
              personId: person.id,
              participantNumber,
              createdById: userId,
              updatedById: userId,
            },
          });

          // Initial history rows for any non-default statuses — cohort and
          // outcome reports read from history, never from current columns.
          const effectiveDate = input.profile.intakeDate ?? new Date();
          const initial: Array<{ domain: string; toValue: string }> = [];
          if (input.profile.insideStatus !== 'not_applicable')
            initial.push({ domain: 'inside_status', toValue: input.profile.insideStatus });
          if (input.profile.outsideStatus !== 'not_applicable')
            initial.push({ domain: 'outside_status', toValue: input.profile.outsideStatus });
          if (input.profile.alumniStatus !== 'not_applicable')
            initial.push({ domain: 'alumni_status', toValue: input.profile.alumniStatus });
          if (input.profile.phase)
            initial.push({ domain: 'phase', toValue: input.profile.phase });
          if (initial.length) {
            await tx.participantStatusHistory.createMany({
              data: initial.map((h) => ({
                participantProfileId: created.id,
                domain: h.domain,
                fromValue: null,
                toValue: h.toValue,
                effectiveDate,
                changedById: userId,
              })),
            });
          }
          return { ...created, person };
        });

        await this.audit.logCreate(userId, 'person', profile.person.id, profile.person);
        await this.audit.logCreate(userId, 'participant_profile', profile.id, profile);
        return profile;
      } catch (err) {
        const isUnique =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (isUnique && attempt < 3) continue;
        throw err;
      }
    }
  }

  /** Full profile view: person, doc IDs, contacts, addresses, consents (§6.1). */
  async get(id: string, viewer: AuthenticatedUser) {
    const profile = await this.prisma.participantProfile.findFirst({
      where: { id, deletedAt: null },
      include: {
        person: {
          include: {
            contacts: {
              where: { deletedAt: null },
              orderBy: [{ isEmergency: 'desc' }, { name: 'asc' }],
            },
            addresses: { orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }] },
            testimonyConsents: { orderBy: { grantedAt: 'desc' } },
          },
        },
        docIds: { orderBy: [{ state: 'asc' }, { createdAt: 'asc' }] },
        offenses: {
          where: { deletedAt: null },
          orderBy: [{ convictionDate: 'desc' }, { createdAt: 'desc' }],
        },
        insideLocations: {
          where: { deletedAt: null },
          include: { institution: { select: { id: true, name: true, state: true } } },
          orderBy: [{ status: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
        },
        assignedCaseManager: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!profile) throw new NotFoundException('Participant not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(viewer.chapter, profile.chapterState);

    // §7.2 field-level sensitivity: DOC numbers, the registry flag and the
    // offense records are justice-history data. DOC rows stay visible (so
    // staff know an ID exists) but values are stripped; the registry flag and
    // offenses are dropped entirely.
    if (!viewer.permissions.has('fields.justice.read')) {
      const {
        sexOffenderRegistry: _sexOffenderRegistry,
        offenses: _offenses,
        ...visible
      } = profile;
      return {
        ...visible,
        docIds: profile.docIds.map(({ docNumber: _docNumber, ...rest }) => rest),
      };
    }
    return profile;
  }

  /**
   * Null = clear field, undefined = no change (see participantUpdateSchema).
   * Any inside/outside/phase/alumni change appends to the status history —
   * transitions are never recorded by overwriting (§4.1.6).
   */
  async update(id: string, input: ParticipantUpdateInput, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.participantProfile.findFirst({
      where: { id, deletedAt: null },
      include: { person: true },
    });
    if (!existing) throw new NotFoundException('Participant not found');
    // Chapter scoping (§7.2): the record must be in the user's chapter, and a
    // scoped user cannot move it to another chapter either (person.state is
    // the mailing address — only profile.chapterState is the chapter).
    assertChapterAccess(user.chapter, existing.chapterState);
    assertChapterAccess(user.chapter, input.profile?.chapterState);

    const { statusEffectiveDate, statusChangeReason, ...profileData } = input.profile ?? {};

    if (profileData.assignedCaseManagerId) {
      await this.assertCaseManagerExists(profileData.assignedCaseManagerId);
    }

    const effectiveDate = statusEffectiveDate ?? new Date();
    const historyRows: Prisma.ParticipantStatusHistoryCreateManyInput[] = [];
    for (const [field, domain] of STATUS_DOMAINS) {
      const next = profileData[field];
      if (next !== undefined && next !== existing[field]) {
        historyRows.push({
          participantProfileId: id,
          domain,
          fromValue: existing[field] ?? null,
          toValue: next,
          effectiveDate,
          reason: statusChangeReason ?? null,
          changedById: userId,
        });
      }
    }

    const personData = input.person
      ? {
          ...input.person,
          // TCPA: stamp the opt-in moment when smsOk flips on
          ...(input.person.smsOk === true && !existing.person.smsOk
            ? { smsConsentAt: new Date() }
            : {}),
          updatedById: userId,
        }
      : undefined;

    await this.prisma.$transaction([
      this.prisma.participantProfile.update({
        where: { id },
        data: { ...profileData, updatedById: userId },
      }),
      ...(personData
        ? [this.prisma.person.update({ where: { id: existing.personId }, data: personData })]
        : []),
      ...historyRows.map((data) => this.prisma.participantStatusHistory.create({ data })),
    ]);

    const updated = await this.prisma.participantProfile.findUniqueOrThrow({
      where: { id },
      include: { person: true },
    });
    await this.audit.logUpdate(userId, 'participant_profile', id, existing, updated);
    return updated;
  }

  /**
   * Records release from custody (§6.1): inside status → released with the
   * release date, the transition appended to status history (§4.1.6), and any
   * active inside location closed as of the release date.
   */
  async release(id: string, input: ReleaseInput, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.participantProfile.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Participant not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(user.chapter, existing.chapterState);
    if (existing.insideStatus === 'released') {
      throw new ConflictException('Participant is already recorded as released');
    }

    const releaseDate = input.releaseDate;
    const [updated] = await this.prisma.$transaction([
      this.prisma.participantProfile.update({
        where: { id },
        data: { insideStatus: 'released', releaseDate, updatedById: userId },
      }),
      this.prisma.participantStatusHistory.create({
        data: {
          participantProfileId: id,
          domain: 'inside_status',
          fromValue: existing.insideStatus,
          toValue: 'released',
          effectiveDate: releaseDate,
          reason: input.reason ?? 'Released from custody',
          changedById: userId,
        },
      }),
      this.prisma.participantInsideLocation.updateMany({
        where: { participantProfileId: id, status: 'active', deletedAt: null },
        data: { status: 'inactive', endDate: releaseDate, updatedById: userId },
      }),
    ]);
    await this.audit.logUpdate(userId, 'participant_profile', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.participantProfile.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Participant not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(user.chapter, existing.chapterState);
    await this.prisma.participantProfile.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'participant_profile', id, existing);
    return { ok: true };
  }

  async statusHistory(id: string, user: AuthenticatedUser) {
    const exists = await this.prisma.participantProfile.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, chapterState: true },
    });
    if (!exists) throw new NotFoundException('Participant not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(user.chapter, exists.chapterState);
    return this.prisma.participantStatusHistory.findMany({
      where: { participantProfileId: id },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * §6.1 workflow 3: graduation requires completion assessments on open
   * enrollments, or an explicit override with reason (audit-logged). Sets
   * alumni status + graduation date and auto-schedules the five outcome
   * check-in waves (§6.7, §9.3).
   */
  async graduate(id: string, input: GraduationInput, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.participantProfile.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Participant not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(user.chapter, existing.chapterState);
    if (existing.alumniStatus !== 'not_applicable') {
      throw new ConflictException('Participant has already graduated');
    }

    const [openInside, openOutside] = await this.prisma.$transaction([
      this.prisma.insideClassEnrollment.findMany({
        where: {
          participantProfileId: id,
          deletedAt: null,
          completionStatus: { in: ['active', 'assessment_pending'] },
        },
        select: { id: true, completionStatus: true, insideClass: { select: { name: true } } },
      }),
      this.prisma.outsideProgramEnrollment.findMany({
        where: {
          participantProfileId: id,
          deletedAt: null,
          status: { in: ['active', 'assessment_pending'] },
        },
        select: { id: true, status: true, outsideProgram: { select: { name: true } } },
      }),
    ]);

    const incomplete = [
      ...openInside.map((e) => `inside class "${e.insideClass.name}" (${e.completionStatus})`),
      ...openOutside.map((e) => `outside program "${e.outsideProgram.name}" (${e.status})`),
    ];
    if (incomplete.length > 0 && !input.overrideIncompleteAssessments) {
      throw new BadRequestException(
        `Cannot graduate: enrollments still need completion with a final assessment — ${incomplete.join(
          '; ',
        )}. Complete them, or set overrideIncompleteAssessments with a reason.`,
      );
    }

    const graduationDate = input.graduationDate;
    const historyRows: Prisma.ParticipantStatusHistoryCreateManyInput[] = [
      {
        participantProfileId: id,
        domain: 'alumni_status',
        fromValue: existing.alumniStatus,
        toValue: 'alumni',
        effectiveDate: graduationDate,
        reason: 'Graduated',
        changedById: userId,
      },
    ];
    if (existing.outsideStatus !== 'completed') {
      historyRows.push({
        participantProfileId: id,
        domain: 'outside_status',
        fromValue: existing.outsideStatus,
        toValue: 'completed',
        effectiveDate: graduationDate,
        reason: 'Graduated',
        changedById: userId,
      });
    }

    const checkins: Prisma.OutcomeCheckinCreateManyInput[] = (
      [
        ['day_30', addDays(graduationDate, 30)],
        ['month_6', addMonths(graduationDate, 6)],
        ['month_12', addMonths(graduationDate, 12)],
        ['month_24', addMonths(graduationDate, 24)],
        ['month_36', addMonths(graduationDate, 36)],
      ] as const
    ).map(([wave, dueDate]) => ({
      participantProfileId: id,
      wave,
      dueDate,
      createdById: userId,
      updatedById: userId,
    }));

    const [updated] = await this.prisma.$transaction([
      this.prisma.participantProfile.update({
        where: { id },
        data: {
          alumniStatus: 'alumni',
          outsideStatus: 'completed',
          graduationDate,
          updatedById: userId,
        },
      }),
      this.prisma.participantStatusHistory.createMany({ data: historyRows }),
      // skipDuplicates on the (profile, wave) unique keeps re-scheduling safe
      this.prisma.outcomeCheckin.createMany({ data: checkins, skipDuplicates: true }),
    ]);

    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'participant_profile',
      entityId: id,
      oldValues: {
        alumniStatus: existing.alumniStatus,
        outsideStatus: existing.outsideStatus,
        graduationDate: existing.graduationDate,
      },
      newValues: {
        alumniStatus: updated.alumniStatus,
        outsideStatus: updated.outsideStatus,
        graduationDate: updated.graduationDate,
      },
      metadata: input.overrideIncompleteAssessments
        ? {
            graduation: true,
            overrideIncompleteAssessments: true,
            overrideReason: input.overrideReason,
            incompleteEnrollments: incomplete,
          }
        : { graduation: true },
    });

    return updated;
  }

  private async nextParticipantNumber(year: number, bump: number) {
    const created = await this.prisma.participantProfile.count({
      where: { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    });
    return `P-${year}-${String(created + 1 + bump).padStart(5, '0')}`;
  }

  private async assertCaseManagerExists(caseManagerId: string | null | undefined) {
    if (!caseManagerId) return;
    const cm = await this.prisma.user.findFirst({
      where: { id: caseManagerId, deletedAt: null },
      select: { id: true },
    });
    if (!cm) throw new BadRequestException('Assigned case manager does not exist');
  }
}
