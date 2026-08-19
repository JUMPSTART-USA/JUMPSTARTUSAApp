import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import {
  HOUSING_EXIT_STATUSES,
  type HousingEnrollmentInput,
  type HousingStatus,
  type HousingTransferInput,
  type ListQuery,
  type TransitionalHomeInput,
  type ChapterState,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface HomeListFilters {
  state?: ChapterState;
  active?: boolean;
}

export interface EnrollmentListFilters {
  homeId?: string;
  participantProfileId?: string;
  status?: HousingStatus;
}

export type TransitionalHomeUpdate = Partial<TransitionalHomeInput>;
export type HousingEnrollmentUpdate = Partial<
  Omit<HousingEnrollmentInput, 'participantProfileId' | 'homeId'>
>;

// Whitelists of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const HOME_SORTABLE = new Set(['name', 'state', 'city', 'capacity', 'createdAt']);
const ENROLLMENT_SORTABLE = new Set(['moveInDate', 'moveOutDate', 'status', 'createdAt']);

const PARTICIPANT_NAME_SELECT = {
  id: true,
  participantNumber: true,
  person: { select: { firstName: true, lastName: true, preferredName: true } },
} as const;

@Injectable()
export class HousingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Transitional homes ────────────────────────────────────────────────────

  async listHomes(query: ListQuery, filters: HomeListFilters) {
    const where: Prisma.TransitionalHomeWhereInput = {
      deletedAt: null,
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
              { houseManagerName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.TransitionalHomeOrderByWithRelationInput =
      query.sortBy && HOME_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transitionalHome.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          _count: { select: { enrollments: { where: { status: 'active', deletedAt: null } } } },
        },
      }),
      this.prisma.transitionalHome.count({ where }),
    ]);

    // Occupancy per home; `available` may go negative — over capacity is
    // allowed and surfaced, never blocked (§6.4).
    const items = rows.map(({ _count, ...home }) => ({
      ...home,
      occupied: _count.enrollments,
      available: home.capacity - _count.enrollments,
    }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Occupancy dashboard feed: beds used vs capacity + current residents (§6.4). */
  async occupancy(user: AuthenticatedUser) {
    const homes = await this.prisma.transitionalHome.findMany({
      // Chapter scoping (§7.2): same derivation as the list filter (own state).
      where: {
        deletedAt: null,
        active: true,
        ...(user.chapter ? { state: user.chapter } : {}),
      },
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
      include: {
        enrollments: {
          where: { status: 'active', deletedAt: null },
          orderBy: { moveInDate: 'asc' },
          include: { participantProfile: { select: PARTICIPANT_NAME_SELECT } },
        },
      },
    });

    return homes.map(({ enrollments, ...home }) => ({
      home,
      capacity: home.capacity,
      occupied: enrollments.length,
      available: home.capacity - enrollments.length,
      currentResidents: enrollments.map((e) => ({
        enrollmentId: e.id,
        participantProfileId: e.participantProfile.id,
        participantNumber: e.participantProfile.participantNumber,
        firstName: e.participantProfile.person.firstName,
        lastName: e.participantProfile.person.lastName,
        preferredName: e.participantProfile.person.preferredName,
        moveInDate: e.moveInDate,
      })),
    }));
  }

  async getHome(id: string, user: AuthenticatedUser) {
    const home = await this.prisma.transitionalHome.findFirst({
      where: { id, deletedAt: null },
      include: {
        enrollments: {
          where: { status: 'active', deletedAt: null },
          orderBy: { moveInDate: 'asc' },
          include: { participantProfile: { select: PARTICIPANT_NAME_SELECT } },
        },
      },
    });
    if (!home) throw new NotFoundException('Transitional home not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own state).
    assertChapterAccess(user.chapter, home.state);
    return home;
  }

  async createHome(input: TransitionalHomeInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): the creator decides the chapter — scoped users
    // get theirs stamped, all-chapters users must pick one.
    const state = resolveCreateChapter(user.chapter, input.state);
    const home = await this.prisma.transitionalHome.create({
      data: { ...input, state, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'transitional_home', home.id, home);
    return home;
  }

  async updateHome(id: string, input: TransitionalHomeUpdate, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findHome(id);
    // Chapter scoping (§7.2): the record must be in the user's chapter, and a
    // scoped user cannot move it to another chapter either.
    assertChapterAccess(user.chapter, existing.state);
    assertChapterAccess(user.chapter, input.state ?? null);
    const updated = await this.prisma.transitionalHome.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'transitional_home', id, existing, updated);
    return updated;
  }

  async softDeleteHome(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findHome(id);
    // Chapter scoping (§7.2): same derivation as the list filter (own state).
    assertChapterAccess(user.chapter, existing.state);
    const residents = await this.countResidents(id);
    if (residents > 0) {
      throw new ConflictException(
        `Home still has ${residents} current resident(s) — move them out or transfer them first`,
      );
    }
    await this.prisma.transitionalHome.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'transitional_home', id, existing);
    return { ok: true };
  }

  // ── Housing enrollments (history is sacred — closed records never change) ─

  async listEnrollments(query: ListQuery, filters: EnrollmentListFilters, user: AuthenticatedUser) {
    const where: Prisma.HousingEnrollmentWhereInput = {
      deletedAt: null,
      // Chapter scoping (§7.2): enrollments derive chapter via home.state.
      ...(user.chapter ? { home: { state: user.chapter } } : {}),
      ...(filters.homeId ? { homeId: filters.homeId } : {}),
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(query.search
        ? {
            participantProfile: {
              OR: [
                { participantNumber: { contains: query.search, mode: 'insensitive' } },
                { person: { firstName: { contains: query.search, mode: 'insensitive' } } },
                { person: { lastName: { contains: query.search, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
    };

    const orderBy: Prisma.HousingEnrollmentOrderByWithRelationInput =
      query.sortBy && ENROLLMENT_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { moveInDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.housingEnrollment.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          home: { select: { id: true, name: true, state: true } },
          participantProfile: { select: PARTICIPANT_NAME_SELECT },
        },
      }),
      this.prisma.housingEnrollment.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getEnrollment(id: string, user: AuthenticatedUser) {
    const enrollment = await this.prisma.housingEnrollment.findFirst({
      where: { id, deletedAt: null },
      include: {
        home: { select: { id: true, name: true, state: true, capacity: true } },
        participantProfile: { select: PARTICIPANT_NAME_SELECT },
      },
    });
    if (!enrollment) throw new NotFoundException('Housing enrollment not found');
    // Chapter scoping (§7.2): derived through the home, like the list filter.
    assertChapterAccess(user.chapter, enrollment.home.state);
    return enrollment;
  }

  /** Move-in. Capacity and duplicate-active-enrollment WARN, never block (§6.4). */
  async moveIn(input: HousingEnrollmentInput, user: AuthenticatedUser) {
    const userId = user.id;
    const home = await this.findHome(input.homeId);
    // Chapter scoping (§7.2): a scoped user can only move residents into a
    // home in their own chapter — the enrollment inherits the home's chapter.
    assertChapterAccess(user.chapter, home.state);
    const participant = await this.prisma.participantProfile.findFirst({
      where: { id: input.participantProfileId, deletedAt: null },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    // ...and only their OWN chapter's participants — no enrolling a foreign
    // participant into a home (which would also read their name back). (§7.2)
    assertChapterAccess(user.chapter, participant.chapterState);
    await this.assertUmbrellaEnrollment(input.outsideProgramEnrollmentId);

    const warnings: string[] = [];
    if (input.status === 'active') {
      const existingActive = await this.prisma.housingEnrollment.findFirst({
        where: {
          participantProfileId: input.participantProfileId,
          status: 'active',
          deletedAt: null,
        },
        include: { home: { select: { name: true } } },
      });
      if (existingActive) {
        warnings.push(
          `Participant already has an active housing enrollment at ${existingActive.home.name} — transfer or move them out to keep occupancy accurate`,
        );
      }
      const occupied = await this.countResidents(home.id);
      if (occupied >= home.capacity) {
        warnings.push(
          `${home.name} is at capacity (${occupied}/${home.capacity}) — move-in recorded anyway`,
        );
      }
    }
    if (!home.active) warnings.push(`${home.name} is marked inactive`);

    const enrollment = await this.prisma.housingEnrollment.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'housing_enrollment', enrollment.id, enrollment);
    return { ...enrollment, warnings };
  }

  /** Move-out and corrections. Re-validates §6.4 rules on the MERGED record. */
  async updateEnrollment(id: string, input: HousingEnrollmentUpdate, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findEnrollment(id);
    // Chapter scoping (§7.2): derived through the home, like the list filter.
    assertChapterAccess(user.chapter, existing.home.state);
    await this.assertUmbrellaEnrollment(input.outsideProgramEnrollmentId);

    const merged = {
      status: input.status ?? existing.status,
      moveInDate: input.moveInDate ?? existing.moveInDate,
      moveOutDate: input.moveOutDate ?? existing.moveOutDate,
      reasonForLeaving: input.reasonForLeaving ?? existing.reasonForLeaving,
      completionAssessment: input.completionAssessment ?? existing.completionAssessment,
    };
    const movedOut = (HOUSING_EXIT_STATUSES as readonly string[]).includes(merged.status);
    if (movedOut && (!merged.moveOutDate || !merged.reasonForLeaving)) {
      throw new BadRequestException(
        'Moving out requires both a move-out date and a reason for leaving',
      );
    }
    if (merged.status === 'completed' && !merged.completionAssessment) {
      throw new BadRequestException(
        'A completion assessment (Blue/Green/Yellow/Red) is required to mark completed — use "assessment pending" until it is in',
      );
    }
    if (merged.moveOutDate && merged.moveOutDate < merged.moveInDate) {
      throw new BadRequestException('Move-out date cannot be before move-in date');
    }

    const updated = await this.prisma.housingEnrollment.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'housing_enrollment', id, existing, updated);
    return updated;
  }

  /**
   * Transfer (§6.4): ONE transaction closes the source enrollment
   * (status transferred, move-out = transfer date, reason recorded) and opens
   * a new one at the destination. One action, two records — history preserved.
   */
  async transfer(id: string, input: HousingTransferInput, user: AuthenticatedUser) {
    const userId = user.id;
    if (input.fromEnrollmentId !== id) {
      throw new BadRequestException('Transfer payload does not match the enrollment in the URL');
    }
    const source = await this.findEnrollment(id);
    // Chapter scoping (§7.2): both ends of a transfer must be reachable —
    // the source enrollment's home and the destination home.
    assertChapterAccess(user.chapter, source.home.state);
    if (source.status !== 'active') {
      throw new BadRequestException('Only an active enrollment can be transferred');
    }
    if (input.toHomeId === source.homeId) {
      throw new BadRequestException('Transfer destination is the same home');
    }
    const toHome = await this.prisma.transitionalHome.findFirst({
      where: { id: input.toHomeId, deletedAt: null },
    });
    if (!toHome) throw new NotFoundException('Destination home not found');
    assertChapterAccess(user.chapter, toHome.state);
    if (input.transferDate < source.moveInDate) {
      throw new BadRequestException('Transfer date cannot be before the current move-in date');
    }

    const warnings: string[] = [];
    if (!toHome.active) warnings.push(`${toHome.name} is marked inactive`);
    const occupied = await this.countResidents(toHome.id);
    if (occupied >= toHome.capacity) {
      warnings.push(
        `${toHome.name} is at capacity (${occupied}/${toHome.capacity}) — transfer recorded anyway`,
      );
    }

    const [closed, opened] = await this.prisma.$transaction([
      this.prisma.housingEnrollment.update({
        where: { id: source.id },
        data: {
          status: 'transferred',
          moveOutDate: input.transferDate,
          reasonForLeaving: input.reason,
          updatedById: userId,
        },
      }),
      this.prisma.housingEnrollment.create({
        data: {
          participantProfileId: source.participantProfileId,
          homeId: input.toHomeId,
          moveInDate: input.transferDate,
          status: 'active',
          // The umbrella outside-program link (§6.4) follows the resident.
          outsideProgramEnrollmentId: source.outsideProgramEnrollmentId,
          notes: input.notes,
          createdById: userId,
          updatedById: userId,
        },
      }),
    ]);
    await this.audit.logUpdate(userId, 'housing_enrollment', closed.id, source, closed);
    await this.audit.logCreate(userId, 'housing_enrollment', opened.id, opened);
    return { closed, opened, warnings };
  }

  /** Soft delete is for true data errors only — exits are status changes. */
  async softDeleteEnrollment(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findEnrollment(id);
    // Chapter scoping (§7.2): derived through the home, like the list filter.
    assertChapterAccess(user.chapter, existing.home.state);
    await this.prisma.housingEnrollment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'housing_enrollment', id, existing);
    return { ok: true };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async findHome(id: string) {
    const home = await this.prisma.transitionalHome.findFirst({ where: { id, deletedAt: null } });
    if (!home) throw new NotFoundException('Transitional home not found');
    return home;
  }

  private async findEnrollment(id: string) {
    const enrollment = await this.prisma.housingEnrollment.findFirst({
      where: { id, deletedAt: null },
      // home.state carried along for the chapter asserts (§7.2).
      include: { home: { select: { state: true } } },
    });
    if (!enrollment) throw new NotFoundException('Housing enrollment not found');
    return enrollment;
  }

  private countResidents(homeId: string) {
    return this.prisma.housingEnrollment.count({
      where: { homeId, status: 'active', deletedAt: null },
    });
  }

  private async assertUmbrellaEnrollment(outsideProgramEnrollmentId: string | undefined) {
    if (!outsideProgramEnrollmentId) return;
    const umbrella = await this.prisma.outsideProgramEnrollment.findFirst({
      where: { id: outsideProgramEnrollmentId, deletedAt: null },
    });
    if (!umbrella) throw new BadRequestException('Linked outside-program enrollment not found');
  }
}
