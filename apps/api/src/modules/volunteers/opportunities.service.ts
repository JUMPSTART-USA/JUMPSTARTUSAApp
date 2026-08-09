import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@jumpstart/database';
import type {
  ListQuery,
  OpportunityStatus,
  ShiftSignupInput,
  ShiftSignupUpdateInput,
  VolunteerOpportunityInput,
  VolunteerShiftInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface OpportunityListFilters {
  status?: OpportunityStatus;
  state?: string;
  institutionId?: string;
}

export interface ShiftListFilters {
  from?: Date;
  to?: Date;
  opportunityId?: string;
}

// Whitelists of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const OPPORTUNITY_SORTABLE = new Set(['name', 'status', 'state', 'location', 'createdAt']);
const SHIFT_SORTABLE = new Set(['shiftDate', 'startTime', 'createdAt']);

const PERSON_NAME_SELECT = { id: true, firstName: true, lastName: true } as const;
const VOLUNTEER_NAME_SELECT = {
  id: true,
  person: { select: PERSON_NAME_SELECT },
} as const;

/** Everything except canceled/waitlisted holds a seat against shift capacity. */
const seated = (status: string) => status !== 'canceled' && status !== 'waitlisted';

/** shiftDate is a @db.Date (UTC midnight) — compare against UTC midnight today. */
function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Opportunities ─────────────────────────────────────────────────────────

  async list(query: ListQuery, filters: OpportunityListFilters) {
    const where: Prisma.VolunteerOpportunityWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.institutionId ? { institutionId: filters.institutionId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.VolunteerOpportunityOrderByWithRelationInput =
      query.sortBy && OPPORTUNITY_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.volunteerOpportunity.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          institution: { select: { id: true, name: true } },
          outsideProgram: { select: { id: true, name: true } },
          event: { select: { id: true, name: true } },
        },
      }),
      this.prisma.volunteerOpportunity.count({ where }),
    ]);

    // Roster/hours stats are COMPUTED per page of opportunities — never stored.
    const ids = rows.map((r) => r.id);
    const shifts = ids.length
      ? await this.prisma.volunteerShift.findMany({
          where: { opportunityId: { in: ids }, deletedAt: null },
          select: {
            opportunityId: true,
            shiftDate: true,
            _count: { select: { signups: { where: { status: { not: 'canceled' } } } } },
          },
        })
      : [];
    const hoursSums = ids.length
      ? await this.prisma.volunteerHoursEntry.groupBy({
          by: ['opportunityId'],
          where: { opportunityId: { in: ids }, status: 'approved', deletedAt: null },
          _sum: { hours: true },
        })
      : [];

    const today = startOfTodayUtc();
    const stats = new Map<
      string,
      { shiftCount: number; upcomingShiftCount: number; signupCount: number }
    >();
    for (const shift of shifts) {
      const stat = stats.get(shift.opportunityId) ?? {
        shiftCount: 0,
        upcomingShiftCount: 0,
        signupCount: 0,
      };
      stat.shiftCount += 1;
      if (shift.shiftDate >= today) stat.upcomingShiftCount += 1;
      stat.signupCount += shift._count.signups;
      stats.set(shift.opportunityId, stat);
    }
    const hoursByOpportunity = new Map(
      hoursSums.map((h) => [h.opportunityId, Number(h._sum.hours ?? 0)]),
    );

    const items = rows.map((row) => ({
      ...row,
      ...(stats.get(row.id) ?? { shiftCount: 0, upcomingShiftCount: 0, signupCount: 0 }),
      approvedHours: hoursByOpportunity.get(row.id) ?? 0,
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const opportunity = await this.prisma.volunteerOpportunity.findFirst({
      where: { id, deletedAt: null },
      include: {
        institution: { select: { id: true, name: true, state: true } },
        outsideProgram: { select: { id: true, name: true } },
        event: { select: { id: true, name: true, eventDate: true } },
        shifts: {
          where: { deletedAt: null },
          orderBy: [{ shiftDate: 'asc' }, { startTime: 'asc' }],
          include: {
            signups: {
              orderBy: { createdAt: 'asc' },
              include: { volunteerProfile: { select: VOLUNTEER_NAME_SELECT } },
            },
          },
        },
      },
    });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own state).
    assertChapterAccess(user.chapter, opportunity.state);

    const [approvedAgg, pendingCount] = await this.prisma.$transaction([
      this.prisma.volunteerHoursEntry.aggregate({
        where: { opportunityId: id, status: 'approved', deletedAt: null },
        _sum: { hours: true },
        _count: true,
      }),
      this.prisma.volunteerHoursEntry.count({
        where: { opportunityId: id, status: 'pending', deletedAt: null },
      }),
    ]);

    const shifts = opportunity.shifts.map((shift) => ({
      ...shift,
      signedUpCount: shift.signups.filter((s) => seated(s.status)).length,
      waitlistCount: shift.signups.filter((s) => s.status === 'waitlisted').length,
    }));

    return {
      ...opportunity,
      shifts,
      hoursSummary: {
        totalApproved: Number(approvedAgg._sum.hours ?? 0),
        approvedEntries: approvedAgg._count,
        pendingEntries: pendingCount,
      },
    };
  }

  async create(input: VolunteerOpportunityInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): stamp the creator's chapter — all-chapters users
    // must pick one explicitly, so no opportunity is ever stateless.
    const state = resolveCreateChapter(user.chapter, input.state);
    await this.assertOpportunityRefs(input);

    const opportunity = await this.prisma.volunteerOpportunity.create({
      data: {
        ...input,
        state,
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'volunteer_opportunity', opportunity.id, opportunity);
    return opportunity;
  }

  async update(id: string, input: Partial<VolunteerOpportunityInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerOpportunity.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Opportunity not found');
    // Chapter scoping (§7.2): the record must be in the user's chapter, and a
    // scoped user cannot move it to another chapter either.
    assertChapterAccess(user.chapter, existing.state);
    assertChapterAccess(user.chapter, input.state);
    await this.assertOpportunityRefs(input);

    // state is a REQUIRED chapter column — a null from the client means "no
    // change", never a clear (the schema still allows null for legacy payloads).
    const { state: inputState, ...rest } = input;
    const updated = await this.prisma.volunteerOpportunity.update({
      where: { id },
      data: { ...rest, ...(inputState ? { state: inputState } : {}), updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'volunteer_opportunity', id, existing, updated);
    return updated;
  }

  // Soft delete — hours entries keep their opportunity link for history.
  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerOpportunity.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Opportunity not found');
    assertChapterAccess(user.chapter, existing.state);

    await this.prisma.volunteerOpportunity.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'volunteer_opportunity', id, existing);
    return { ok: true };
  }

  // ── Shifts ────────────────────────────────────────────────────────────────

  async createShift(opportunityId: string, input: VolunteerShiftInput, user: AuthenticatedUser) {
    const userId = user.id;
    const opportunity = await this.prisma.volunteerOpportunity.findFirst({
      where: { id: opportunityId, deletedAt: null },
    });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    assertChapterAccess(user.chapter, opportunity.state);

    const shift = await this.prisma.volunteerShift.create({
      data: { ...input, opportunityId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'volunteer_shift', shift.id, shift);
    return shift;
  }

  /** Schedule view: shifts across opportunities within a date range. */
  async listShifts(query: ListQuery, filters: ShiftListFilters, user: AuthenticatedUser) {
    const where: Prisma.VolunteerShiftWhereInput = {
      deletedAt: null,
      ...(filters.opportunityId ? { opportunityId: filters.opportunityId } : {}),
      ...(filters.from || filters.to
        ? {
            shiftDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      // Chapter scoping (§7.2): shifts derive state through their opportunity.
      opportunity: {
        deletedAt: null,
        ...(user.chapter ? { state: user.chapter } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      },
    };

    const orderBy: Prisma.VolunteerShiftOrderByWithRelationInput[] =
      query.sortBy && SHIFT_SORTABLE.has(query.sortBy)
        ? [{ [query.sortBy]: query.sortDir }]
        : [{ shiftDate: 'asc' }, { startTime: 'asc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.volunteerShift.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          opportunity: { select: { id: true, name: true, status: true, state: true } },
          signups: { select: { status: true } },
        },
      }),
      this.prisma.volunteerShift.count({ where }),
    ]);

    const items = rows.map(({ signups, ...shift }) => ({
      ...shift,
      signedUpCount: signups.filter((s) => seated(s.status)).length,
      waitlistCount: signups.filter((s) => s.status === 'waitlisted').length,
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async updateShift(id: string, input: Partial<VolunteerShiftInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerShift.findFirst({
      where: { id, deletedAt: null, opportunity: { deletedAt: null } },
      include: { opportunity: { select: { state: true } } },
    });
    if (!existing) throw new NotFoundException('Shift not found');
    // Chapter scoping (§7.2): derived through the parent opportunity.
    assertChapterAccess(user.chapter, existing.opportunity.state);
    const { opportunity: _opportunity, ...shiftOnly } = existing;

    const { updated, promotions } = await this.serializable(async (tx) => {
      const updated = await tx.volunteerShift.update({
        where: { id },
        data: { ...input, updatedById: userId },
      });
      // A capacity change can open seats — fill them from the waitlist (oldest
      // first) so raising the capacity doesn't strand waitlisted volunteers.
      const promotions =
        input.capacity !== undefined
          ? await this.promoteWaitlisted(tx, id, updated.capacity, userId)
          : [];
      return { updated, promotions };
    });
    await this.audit.logUpdate(userId, 'volunteer_shift', id, shiftOnly, updated);
    for (const p of promotions) {
      await this.audit.logUpdate(userId, 'volunteer_shift_signup', p.id, p.before, p.after);
    }
    return updated;
  }

  // Soft delete — signups stay attached as history.
  async softDeleteShift(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerShift.findFirst({
      where: { id, deletedAt: null, opportunity: { deletedAt: null } },
      include: { opportunity: { select: { state: true } } },
    });
    if (!existing) throw new NotFoundException('Shift not found');
    assertChapterAccess(user.chapter, existing.opportunity.state);
    const { opportunity: _opportunity, ...shiftOnly } = existing;

    await this.prisma.volunteerShift.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'volunteer_shift', id, shiftOnly);
    return { ok: true };
  }

  // ── Signups (roster) ──────────────────────────────────────────────────────

  /**
   * Capacity overflow lands as waitlisted instead of failing — the response's
   * `waitlisted` flag lets the client surface it. shiftId+volunteerProfileId
   * is unique, so a canceled row is reactivated rather than duplicated.
   */
  async createSignup(shiftId: string, input: ShiftSignupInput, user: AuthenticatedUser) {
    const userId = user.id;
    const shift = await this.prisma.volunteerShift.findFirst({
      where: { id: shiftId, deletedAt: null, opportunity: { deletedAt: null } },
      include: { opportunity: { select: { state: true } } },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    assertChapterAccess(user.chapter, shift.opportunity.state);

    const profile = await this.prisma.volunteerProfile.findFirst({
      where: { id: input.volunteerProfileId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Volunteer not found');
    // Chapter scoping (§7.2): the signed-up volunteer must be in the user's
    // chapter too — not just the shift's opportunity.
    assertChapterAccess(user.chapter, profile.chapterState);

    // Seat count + write run in one SERIALIZABLE transaction — two concurrent
    // signups must not both observe the last open seat. A concurrent duplicate
    // for the same volunteer loses on @@unique([shiftId, volunteerProfileId])
    // (P2002) and maps to the same 409 as the in-transaction pre-check.
    const result = await this
      .serializable(async (tx) => {
        const existing = await tx.volunteerShiftSignup.findUnique({
          where: {
            shiftId_volunteerProfileId: { shiftId, volunteerProfileId: input.volunteerProfileId },
          },
        });
        if (existing && existing.status !== 'canceled') {
          throw new ConflictException('Volunteer is already signed up for this shift');
        }

        const seatsTaken = await tx.volunteerShiftSignup.count({
          where: { shiftId, status: { notIn: ['canceled', 'waitlisted'] } },
        });
        const status =
          shift.capacity != null && seatsTaken >= shift.capacity ? 'waitlisted' : 'signed_up';

        if (existing) {
          const updated = await tx.volunteerShiftSignup.update({
            where: { id: existing.id },
            data: {
              status,
              ...(input.notes !== undefined ? { notes: input.notes } : {}),
              checkedInAt: null,
              checkedOutAt: null,
              // A re-signup joins the queue NOW — keeping the original
              // createdAt would let a returning volunteer jump the waitlist
              // (promotion orders by createdAt).
              createdAt: new Date(),
              updatedById: userId,
            },
          });
          return { before: existing, row: updated, status };
        }

        const created = await tx.volunteerShiftSignup.create({
          data: {
            shiftId,
            volunteerProfileId: input.volunteerProfileId,
            notes: input.notes,
            status,
            createdById: userId,
            updatedById: userId,
          },
        });
        return { before: null, row: created, status };
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('Volunteer is already signed up for this shift');
        }
        throw err;
      });

    if (result.before) {
      await this.audit.logUpdate(
        userId,
        'volunteer_shift_signup',
        result.row.id,
        result.before,
        result.row,
      );
    } else {
      await this.audit.logCreate(userId, 'volunteer_shift_signup', result.row.id, result.row);
    }
    return { ...result.row, waitlisted: result.status === 'waitlisted' };
  }

  /**
   * Status transitions. Canceling a signed_up/confirmed signup auto-promotes
   * the oldest waitlisted signup on the shift — but only into a genuinely open
   * seat (the shift may be over-full after a capacity reduction). Both changes
   * are audited; the promoted row is returned so the client can surface it.
   */
  async updateSignup(id: string, input: ShiftSignupUpdateInput, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerShiftSignup.findFirst({
      where: { id, shift: { deletedAt: null, opportunity: { deletedAt: null } } },
      include: {
        shift: { select: { id: true, capacity: true, opportunity: { select: { state: true } } } },
      },
    });
    if (!existing) throw new NotFoundException('Signup not found');
    assertChapterAccess(user.chapter, existing.shift.opportunity.state);
    const { shift: _shift, ...signupOnly } = existing;

    const data: Prisma.VolunteerShiftSignupUncheckedUpdateInput = { updatedById: userId };
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.status) {
      data.status = input.status;
      // Marking attended implies presence — stamp check-in if it never happened.
      if (input.status === 'attended' && !existing.checkedInAt) data.checkedInAt = new Date();
    }

    const vacatesSeat =
      input.status === 'canceled' &&
      (existing.status === 'signed_up' || existing.status === 'confirmed');

    // Cancel + seat re-count + promotion run in one SERIALIZABLE transaction
    // so a concurrent signup cannot take the vacated seat twice.
    const { updated, promotions } = await this.serializable(async (tx) => {
      const updated = await tx.volunteerShiftSignup.update({ where: { id }, data });
      const promotions = vacatesSeat
        ? await this.promoteWaitlisted(tx, existing.shiftId, existing.shift.capacity, userId)
        : [];
      return { updated, promotions };
    });

    await this.audit.logUpdate(userId, 'volunteer_shift_signup', id, signupOnly, updated);
    for (const p of promotions) {
      await this.audit.logUpdate(userId, 'volunteer_shift_signup', p.id, p.before, p.after);
    }

    const first = promotions[0];
    return {
      ...updated,
      promoted: first ? { ...first.after, volunteerProfile: first.volunteerProfile } : null,
    };
  }

  async checkIn(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerShiftSignup.findFirst({
      where: { id, shift: { deletedAt: null, opportunity: { deletedAt: null } } },
      include: { shift: { select: { opportunity: { select: { state: true } } } } },
    });
    if (!existing) throw new NotFoundException('Signup not found');
    assertChapterAccess(user.chapter, existing.shift.opportunity.state);
    if (existing.status === 'canceled') throw new ConflictException('Signup is canceled');
    if (existing.checkedInAt) throw new ConflictException('Volunteer is already checked in');
    const { shift: _shift, ...signupOnly } = existing;

    const updated = await this.prisma.volunteerShiftSignup.update({
      where: { id },
      data: { checkedInAt: new Date(), status: 'attended', updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'volunteer_shift_signup', id, signupOnly, updated);
    return updated;
  }

  /**
   * Check-out closes the visit and generates an APPROVED hours entry from the
   * recorded in/out times — unless one already exists for this shift+volunteer
   * (guard against double entry; the DB has no unique on that pair).
   */
  async checkOut(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerShiftSignup.findFirst({
      where: { id, shift: { deletedAt: null, opportunity: { deletedAt: null } } },
      include: {
        shift: {
          select: {
            id: true,
            shiftDate: true,
            opportunityId: true,
            opportunity: { select: { state: true, institutionId: true } },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Signup not found');
    assertChapterAccess(user.chapter, existing.shift.opportunity.state);
    if (!existing.checkedInAt) {
      throw new BadRequestException('Volunteer has not been checked in');
    }
    if (existing.checkedOutAt) throw new ConflictException('Volunteer is already checked out');
    const { shift, ...signupOnly } = existing;
    const checkedInAt = existing.checkedInAt;

    const checkedOutAt = new Date();
    // Guarded write in one transaction: of two concurrent check-outs, the
    // loser matches zero rows (checkedOutAt already set) and 409s instead of
    // minting a second approved hours entry.
    const { updated, hoursEntry } = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.volunteerShiftSignup.updateMany({
        where: { id, checkedOutAt: null },
        data: { checkedOutAt, status: 'attended', updatedById: userId },
      });
      if (count === 0) throw new ConflictException('Volunteer is already checked out');
      const updated = await tx.volunteerShiftSignup.findUniqueOrThrow({ where: { id } });

      let hoursEntry = null;
      const duplicate = await tx.volunteerHoursEntry.findFirst({
        where: {
          shiftId: shift.id,
          volunteerProfileId: existing.volunteerProfileId,
          deletedAt: null,
        },
      });
      if (!duplicate) {
        const elapsedMs = checkedOutAt.getTime() - checkedInAt.getTime();
        const hours = Math.min(24, Math.max(0.01, Math.round((elapsedMs / 3_600_000) * 100) / 100));
        hoursEntry = await tx.volunteerHoursEntry.create({
          data: {
            volunteerProfileId: existing.volunteerProfileId,
            activityDate: shift.shiftDate,
            hours,
            opportunityId: shift.opportunityId,
            shiftId: shift.id,
            institutionId: shift.opportunity.institutionId,
            source: 'check_in',
            status: 'approved',
            approvedById: userId,
            approvedAt: checkedOutAt,
            createdById: userId,
            updatedById: userId,
          },
        });
      }
      return { updated, hoursEntry };
    });

    await this.audit.logUpdate(userId, 'volunteer_shift_signup', id, signupOnly, updated);
    if (hoursEntry) {
      await this.audit.logCreate(userId, 'volunteer_hours_entry', hoursEntry.id, hoursEntry);
    }

    return { ...updated, hoursEntry };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Interactive SERIALIZABLE transaction with a single retry on a
   * serialization conflict (P2034) — for read-then-write decisions (seat
   * counts, waitlist promotion) that must not race a concurrent writer.
   */
  private async serializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const opts = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
    try {
      return await this.prisma.$transaction(fn, opts);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        return this.prisma.$transaction(fn, opts);
      }
      throw err;
    }
  }

  /**
   * Fill open seats from the waitlist, oldest first — only while seats remain
   * (none are promoted when the shift is at or over capacity; a null capacity
   * is unlimited). Returns before/after pairs so callers can audit-log after
   * the transaction commits.
   */
  private async promoteWaitlisted(
    tx: Prisma.TransactionClient,
    shiftId: string,
    capacity: number | null,
    userId: string,
  ) {
    const seatsTaken = await tx.volunteerShiftSignup.count({
      where: { shiftId, status: { notIn: ['canceled', 'waitlisted'] } },
    });
    const waitlisted = await tx.volunteerShiftSignup.findMany({
      where: { shiftId, status: 'waitlisted' },
      orderBy: { createdAt: 'asc' },
      ...(capacity != null ? { take: Math.max(0, capacity - seatsTaken) } : {}),
      include: { volunteerProfile: { select: VOLUNTEER_NAME_SELECT } },
    });

    const promotions = [];
    for (const next of waitlisted) {
      const { volunteerProfile, ...before } = next;
      const after = await tx.volunteerShiftSignup.update({
        where: { id: next.id },
        data: { status: 'signed_up', updatedById: userId },
      });
      promotions.push({ id: next.id, before, after, volunteerProfile });
    }
    return promotions;
  }

  private async assertOpportunityRefs(input: {
    institutionId?: string | null;
    outsideProgramId?: string | null;
    eventId?: string | null;
  }) {
    if (input.institutionId) {
      const institution = await this.prisma.institution.findFirst({
        where: { id: input.institutionId, deletedAt: null },
      });
      if (!institution) throw new NotFoundException('Institution not found');
    }
    if (input.outsideProgramId) {
      const program = await this.prisma.outsideProgram.findFirst({
        where: { id: input.outsideProgramId, deletedAt: null },
      });
      if (!program) throw new NotFoundException('Outside program not found');
    }
    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
      });
      if (!event) throw new NotFoundException('Event not found');
    }
  }
}
