import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  DonorCreateInput,
  DonorInput,
  DonorRelationshipInput,
  DonorType,
  ListQuery,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import {
  donorLifecycle,
  pledgeComputed,
  roundMoney,
  startOfUtcDay,
  type DonorLifecycle,
} from './giving.util';

export interface DonorListFilters {
  /** A single record, for a picker turning an id from a URL back into a name. */
  id?: string;
  donorType?: DonorType;
  status?: 'active' | 'lapsed' | 'inactive';
  householdId?: string;
  /** Chapter filter — the controller forces `user.chapter ?? requested`. */
  state?: string;
  hasEmail?: boolean;
}

/** One merged donor-timeline row: gifts, interactions and tasks by date. */
export interface TimelineRow {
  type: 'donation' | 'interaction' | 'task' | 'note';
  date: Date;
  label: string;
  amount?: number;
  meta: Record<string, unknown>;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'donorType', 'status', 'city', 'state', 'chapterState', 'createdAt']);

/** Distinct, order-preserving named refs (drops nulls from optional relations). */
function dedupeRefs(refs: Array<{ id: string; name: string } | null>) {
  const seen = new Map<string, { id: string; name: string }>();
  for (const ref of refs) {
    if (ref && !seen.has(ref.id)) seen.set(ref.id, { id: ref.id, name: ref.name });
  }
  return [...seen.values()];
}

@Injectable()
export class DonorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: DonorListFilters) {
    const where: Prisma.DonorWhereInput = {
      deletedAt: null,
      ...(filters.donorType ? { donorType: filters.donorType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.householdId ? { householdId: filters.householdId } : {}),
      // Chapter scoping (§7.2): donor chapter is the own chapterState column —
      // postal `state` is a mailing address, never a chapter.
      ...(filters.state ? { chapterState: filters.state } : {}),
      // A picker rehydrating one id, INSIDE this where so the chapter clause
      // above still applies: another chapter's id returns an empty page.
      ...(filters.id ? { id: filters.id } : {}),
      ...(filters.hasEmail !== undefined
        ? { email: filters.hasEmail ? { not: null } : null }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.DonorOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [donors, total] = await this.prisma.$transaction([
      this.prisma.donor.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { household: { select: { id: true, name: true } } },
      }),
      this.prisma.donor.count({ where }),
    ]);

    // Lifetime giving / gift dates / lifecycle are computed from hard-credit
    // donations — never stored. Soft credits are deliberately excluded.
    const now = new Date();
    const stats = donors.length
      ? await this.prisma.donation.groupBy({
          by: ['donorId'],
          where: { donorId: { in: donors.map((d) => d.id) }, deletedAt: null },
          _sum: { amount: true },
          _min: { donationDate: true },
          _max: { donationDate: true },
        })
      : [];
    const byDonor = new Map(stats.map((s) => [s.donorId, s]));

    const items = donors.map((donor) => {
      const s = byDonor.get(donor.id);
      return {
        ...donor,
        lifetimeGiving: Number(s?._sum.amount ?? 0),
        lastGiftDate: s?._max.donationDate ?? null,
        lifecycle: donorLifecycle(s?._min.donationDate, s?._max.donationDate, now) as DonorLifecycle,
      };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const donor = await this.prisma.donor.findFirst({
      where: { id, deletedAt: null },
      include: { person: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!donor) throw new NotFoundException('Donor not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(user.chapter, donor.chapterState);
    return donor;
  }

  /** Donor detail: profile + household + relationships + full giving picture (§6.8). */
  async detail(id: string, user: AuthenticatedUser) {
    const donor = await this.prisma.donor.findFirst({
      where: { id, deletedAt: null },
      include: {
        person: { select: { id: true, firstName: true, lastName: true } },
        household: {
          include: {
            members: {
              where: { deletedAt: null },
              select: { id: true, name: true, isHeadOfHousehold: true },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });
    if (!donor) throw new NotFoundException('Donor not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(user.chapter, donor.chapterState);

    const [donations, outgoing, incoming, softCreditsReceived, pledges, recurringGifts, interactions, openTasks] =
      await Promise.all([
        this.prisma.donation.findMany({
          where: { donorId: id, deletedAt: null },
          orderBy: { donationDate: 'desc' },
          include: {
            campaign: { select: { id: true, name: true } },
            event: { select: { id: true, name: true } },
            fund: { select: { id: true, name: true } },
            appeal: { select: { id: true, name: true } },
          },
        }),
        // Related/soft-crediting donors are separate records that may live in
        // other chapters; a scoped viewer only sees the same-chapter ones so
        // no foreign donor name/id leaks through the subject's detail (§7.2).
        this.prisma.donorRelationship.findMany({
          where: {
            donorId: id,
            relatedDonor: {
              deletedAt: null,
              ...(user.chapter ? { chapterState: user.chapter } : {}),
            },
          },
          include: { relatedDonor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.donorRelationship.findMany({
          where: {
            relatedDonorId: id,
            donor: { deletedAt: null, ...(user.chapter ? { chapterState: user.chapter } : {}) },
          },
          include: { donor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.softCredit.findMany({
          where: {
            donorId: id,
            donation: {
              deletedAt: null,
              ...(user.chapter ? { donor: { chapterState: user.chapter } } : {}),
            },
          },
          include: {
            donation: {
              select: {
                id: true,
                donationDate: true,
                amount: true,
                donor: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.pledge.findMany({
          where: { donorId: id, deletedAt: null },
          orderBy: { pledgeDate: 'desc' },
          include: {
            campaign: { select: { id: true, name: true } },
            fund: { select: { id: true, name: true } },
            appeal: { select: { id: true, name: true } },
          },
        }),
        this.prisma.recurringGift.findMany({
          where: { donorId: id, deletedAt: null },
          orderBy: { startDate: 'desc' },
          include: {
            campaign: { select: { id: true, name: true } },
            fund: { select: { id: true, name: true } },
            appeal: { select: { id: true, name: true } },
          },
        }),
        this.prisma.donorInteraction.findMany({
          where: { donorId: id },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: 10,
        }),
        this.prisma.donorTask.findMany({
          where: { donorId: id, status: 'open' },
          orderBy: { dueDate: 'asc' },
        }),
      ]);

    // Relationships from both directions — incoming rows are relabeled with
    // the reciprocal type so the list always reads from this donor's side.
    const relationships = [
      ...outgoing.map((r) => ({
        id: r.id,
        direction: 'outgoing' as const,
        relatedDonor: r.relatedDonor,
        relationshipType: r.relationshipType,
        reciprocalType: r.reciprocalType,
        notes: r.notes,
      })),
      ...incoming.map((r) => ({
        id: r.id,
        direction: 'incoming' as const,
        relatedDonor: r.donor,
        relationshipType: r.reciprocalType ?? r.relationshipType,
        reciprocalType: r.relationshipType,
        notes: r.notes,
      })),
    ];

    // Per-pledge and per-recurring-gift payment rollups.
    const [pledgePaid, rgStats] = await Promise.all([
      pledges.length
        ? this.prisma.donation.groupBy({
            by: ['pledgeId'],
            where: { pledgeId: { in: pledges.map((p) => p.id) }, deletedAt: null },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      recurringGifts.length
        ? this.prisma.donation.groupBy({
            by: ['recurringGiftId'],
            where: { recurringGiftId: { in: recurringGifts.map((r) => r.id) }, deletedAt: null },
            _sum: { amount: true },
            _count: { _all: true },
            _max: { donationDate: true },
          })
        : Promise.resolve([]),
    ]);
    const paidByPledge = new Map(pledgePaid.map((s) => [s.pledgeId, Number(s._sum.amount ?? 0)]));
    const rgStatsByGift = new Map(rgStats.map((s) => [s.recurringGiftId, s]));

    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const lifetime = roundMoney(donations.reduce((sum, d) => sum + Number(d.amount), 0));
    const ytd = roundMoney(
      donations
        .filter((d) => d.donationDate >= yearStart)
        .reduce((sum, d) => sum + Number(d.amount), 0),
    );
    const firstGiftDate = donations.length ? donations[donations.length - 1]!.donationDate : null;
    const lastGiftDate = donations[0]?.donationDate ?? null;
    const largestGift = donations.reduce((max, d) => Math.max(max, Number(d.amount)), 0);

    return {
      donor,
      relationships,
      givingSummary: {
        lifetime,
        ytd,
        firstGiftDate,
        lastGiftDate,
        giftCount: donations.length,
        largestGift: donations.length ? largestGift : 0,
        averageGift: donations.length ? roundMoney(lifetime / donations.length) : 0,
        lifecycle: donorLifecycle(firstGiftDate, lastGiftDate, now),
        softCreditTotal: roundMoney(
          softCreditsReceived.reduce((sum, s) => sum + Number(s.amount), 0),
        ),
      },
      donations,
      softCreditsReceived,
      // Schedule math must match the pledge/recurring list endpoints — the
      // profile page renders the same inArrears/isOverdue badges.
      pledges: pledges.map((p) => ({
        ...p,
        ...pledgeComputed(p, paidByPledge.get(p.id) ?? 0, now),
      })),
      recurringGifts: recurringGifts.map((r) => {
        const s = rgStatsByGift.get(r.id);
        return {
          ...r,
          lastPaymentDate: s?._max.donationDate ?? null,
          paymentCount: s?._count._all ?? 0,
          totalGiven: Number(s?._sum.amount ?? 0),
          isOverdue:
            r.status === 'active' && r.nextGiftDate !== null && r.nextGiftDate < startOfUtcDay(now),
        };
      }),
      interactions,
      openTasks,
      // Distinct campaigns/events this donor has supported (Involvement tab).
      campaigns: dedupeRefs(donations.map((d) => d.campaign)),
      events: dedupeRefs(donations.map((d) => d.event)),
    };
  }

  /** Merged activity feed — gifts, interactions and tasks, newest first. */
  async timeline(id: string, query: ListQuery, user: AuthenticatedUser) {
    await this.get(id, user); // 404 + chapter check

    const [donations, interactions, tasks] = await Promise.all([
      this.prisma.donation.findMany({
        where: { donorId: id, deletedAt: null },
        select: {
          id: true,
          donationDate: true,
          amount: true,
          isRecurring: true,
          fund: { select: { name: true } },
          campaign: { select: { name: true } },
          appeal: { select: { name: true } },
        },
      }),
      this.prisma.donorInteraction.findMany({
        where: { donorId: id },
        select: {
          id: true,
          date: true,
          subject: true,
          channel: true,
          purpose: true,
          isInbound: true,
        },
      }),
      this.prisma.donorTask.findMany({
        where: { donorId: id },
        select: {
          id: true,
          subject: true,
          status: true,
          dueDate: true,
          completedAt: true,
          createdAt: true,
        },
      }),
    ]);

    const rows: TimelineRow[] = [
      ...donations.map((d) => ({
        type: 'donation' as const,
        date: d.donationDate,
        label: d.fund ? `Gift — ${d.fund.name}` : 'Gift',
        amount: Number(d.amount),
        meta: {
          id: d.id,
          isRecurring: d.isRecurring,
          fund: d.fund?.name ?? null,
          campaign: d.campaign?.name ?? null,
          appeal: d.appeal?.name ?? null,
        },
      })),
      ...interactions.map((i) => ({
        type: 'interaction' as const,
        date: i.date,
        label: i.subject,
        meta: { id: i.id, channel: i.channel, purpose: i.purpose, isInbound: i.isInbound },
      })),
      ...tasks.map((t) => ({
        type: 'task' as const,
        date: t.completedAt ?? t.dueDate ?? t.createdAt,
        label: t.subject,
        meta: { id: t.id, status: t.status, dueDate: t.dueDate },
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(input: DonorCreateInput, user: AuthenticatedUser) {
    const userId = user.id;
    const { confirmNotDuplicate, ...data } = input;
    // Chapter scoping (§7.2): scoped creators are stamped, all-chapters
    // creators must pick the chapter explicitly.
    const chapterState = resolveCreateChapter(user.chapter, data.chapterState);
    await this.assertPersonExists(data.personId);
    await this.assertHouseholdInChapter(data.householdId, chapterState);

    // §5: individual donors are often existing participants or volunteers.
    // Surface matching people so staff link the donor to them (or open the
    // donor that already exists) instead of creating a disconnected record.
    if (data.donorType === 'individual' && !data.personId && !confirmNotDuplicate) {
      const candidates = await this.findPersonCandidates(data, user.chapter);
      if (candidates.length > 0) {
        throw new ConflictException({
          message:
            'Possible matching person(s) found — link the donor to one, or re-submit with confirmNotDuplicate to create anyway',
          candidates,
        });
      }
    }

    const donor = await this.prisma.donor.create({
      data: { ...data, chapterState, createdById: userId, updatedById: userId },
    });
    if (donor.isHeadOfHousehold && donor.householdId) {
      await this.clearOtherHeads(donor.householdId, donor.id, userId);
    }
    await this.audit.logCreate(userId, 'donor', donor.id, donor);
    return donor;
  }

  async update(id: string, input: Partial<DonorInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // 404 + chapter check
    // Chapter scoping (§7.2): a scoped user cannot move the donor to another
    // chapter either (the existing-record check above covers the other direction).
    assertChapterAccess(user.chapter, input.chapterState);
    await this.assertPersonExists(input.personId);
    // The donor's household must live in the donor's (possibly new) chapter.
    const nextChapter = input.chapterState ?? existing.chapterState;
    const nextHouseholdId =
      input.householdId === undefined ? existing.householdId : input.householdId;
    await this.assertHouseholdInChapter(nextHouseholdId, nextChapter);

    // Moving between households must not carry headship into the destination —
    // the incumbent head stays unless the request claims headship explicitly.
    const changingHousehold =
      input.householdId !== undefined && input.householdId !== existing.householdId;

    const updated = await this.prisma.donor.update({
      where: { id },
      data: {
        ...input,
        // Leaving or changing household clears the head flag unless explicitly set.
        ...(input.householdId === null ||
        (changingHousehold && input.isHeadOfHousehold === undefined)
          ? { isHeadOfHousehold: false }
          : {}),
        updatedById: userId,
      },
    });
    if (updated.isHeadOfHousehold && updated.householdId) {
      await this.clearOtherHeads(updated.householdId, id, userId);
    }
    await this.audit.logUpdate(userId, 'donor', id, existing, updated);
    return updated;
  }

  // Donations keep their donorId — the donor simply disappears from lists.
  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // 404 + chapter check
    await this.prisma.donor.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'donor', id, existing);
    return { ok: true };
  }

  // ── Relationships ─────────────────────────────────────────────────────────
  // One row per pair; the reciprocal label covers the reverse direction.

  async addRelationship(donorId: string, input: DonorRelationshipInput, user: AuthenticatedUser) {
    const userId = user.id;
    await this.get(donorId, user); // 404 + chapter check
    if (input.relatedDonorId === donorId) {
      throw new BadRequestException('A donor cannot be related to themselves');
    }
    const related = await this.prisma.donor.findFirst({
      where: { id: input.relatedDonorId, deletedAt: null },
    });
    if (!related) throw new BadRequestException('Related donor not found');
    // Chapter scoping (§7.2): both ends checked BEFORE the duplicate lookup so
    // a scoped user cannot probe foreign-chapter relationships.
    assertChapterAccess(user.chapter, related.chapterState);

    const duplicate = await this.prisma.donorRelationship.findFirst({
      where: {
        OR: [
          { donorId, relatedDonorId: input.relatedDonorId },
          { donorId: input.relatedDonorId, relatedDonorId: donorId },
        ],
      },
    });
    if (duplicate) throw new ConflictException('These donors are already related');

    const relationship = await this.prisma.donorRelationship.create({
      data: { ...input, donorId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'donor_relationship', relationship.id, relationship);
    return relationship;
  }

  // No deletedAt column — delete exists for corrections; the audit row keeps history.
  async removeRelationship(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.donorRelationship.findUnique({
      where: { id },
      include: { donor: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Relationship not found');
    // Chapter scoping (§7.2): derived through the owning donor.
    assertChapterAccess(user.chapter, existing.donor.chapterState);
    const { donor: _donor, ...relationshipOnly } = existing;
    await this.prisma.donorRelationship.delete({ where: { id } });
    await this.audit.logDelete(userId, 'donor_relationship', id, relationshipOnly);
    return { ok: true };
  }

  /** Only one head of household — setting a head clears (and audits) the others. */
  private async clearOtherHeads(householdId: string, donorId: string, userId: string) {
    const demoted = await this.prisma.donor.findMany({
      where: { householdId, id: { not: donorId }, isHeadOfHousehold: true },
      select: { id: true },
    });
    for (const other of demoted) {
      await this.prisma.donor.update({
        where: { id: other.id },
        data: { isHeadOfHousehold: false, updatedById: userId },
      });
      await this.audit.logUpdate(
        userId,
        'donor',
        other.id,
        { isHeadOfHousehold: true },
        { isHeadOfHousehold: false },
      );
    }
  }

  private async assertPersonExists(personId?: string | null) {
    if (!personId) return;
    const person = await this.prisma.person.findFirst({
      where: { id: personId, deletedAt: null },
    });
    if (!person) throw new BadRequestException('Linked person not found');
  }

  /**
   * The linked household must exist AND live in the donor's chapter — a donor
   * joining a household is the same invariant households.addMember enforces.
   */
  private async assertHouseholdInChapter(
    householdId: string | null | undefined,
    donorChapter: string,
  ) {
    if (!householdId) return;
    const household = await this.prisma.household.findFirst({
      where: { id: householdId, deletedAt: null },
    });
    if (!household) throw new BadRequestException('Household not found');
    if (household.chapterState !== donorChapter) {
      throw new BadRequestException('Household belongs to a different chapter than the donor');
    }
  }

  /**
   * People who look like this new individual donor (§5) — mirrors the
   * volunteer duplicate matcher: name (first+last, case-insensitive), email,
   * or normalized phone. Donor names are a single string, so the name clause
   * only applies when it splits into at least two tokens.
   *
   * Chapter scoping (§7.2, cross-chapter dedupe): scoped users only see
   * candidates from their own chapter — a person is in-chapter through their
   * participant/volunteer profile, or (with neither profile) when none of
   * their linked donors sit in another chapter. All-chapters users keep
   * global matching and do the cross-chapter merging.
   */
  private async findPersonCandidates(
    input: {
      name: string;
      email?: string | null;
      phone?: string | null;
    },
    userChapter: string | null,
  ) {
    const or: Prisma.PersonWhereInput[] = [];
    const tokens = input.name.trim().split(/\s+/);
    if (tokens.length >= 2) {
      or.push({
        AND: [
          { firstName: { equals: tokens[0]!, mode: 'insensitive' } },
          { lastName: { equals: tokens[tokens.length - 1]!, mode: 'insensitive' } },
        ],
      });
    }
    if (input.email) or.push({ primaryEmail: { equals: input.email, mode: 'insensitive' } });
    if (input.phone) or.push({ primaryPhone: input.phone });
    if (or.length === 0) return [];

    const chapterClause: Prisma.PersonWhereInput[] = userChapter
      ? [
          {
            OR: [
              { participantProfile: { chapterState: userChapter } },
              { volunteerProfile: { chapterState: userChapter } },
              {
                participantProfile: null,
                volunteerProfile: null,
                donors: { none: { deletedAt: null, chapterState: { not: userChapter } } },
              },
            ],
          },
        ]
      : [];

    const people = await this.prisma.person.findMany({
      where: { deletedAt: null, AND: [{ OR: or }, ...chapterClause] },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        primaryEmail: true,
        primaryPhone: true,
        city: true,
        state: true,
        participantProfile: { select: { id: true, deletedAt: true } },
        volunteerProfile: { select: { id: true, deletedAt: true } },
        // A donor already linked to this person means "open that donor", not
        // "create another one".
        donors: { where: { deletedAt: null }, select: { id: true, name: true }, take: 1 },
      },
      take: 10,
    });

    return people.map((p) => ({
      personId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      primaryEmail: p.primaryEmail,
      primaryPhone: p.primaryPhone,
      city: p.city,
      state: p.state,
      isParticipant: Boolean(p.participantProfile && !p.participantProfile.deletedAt),
      isVolunteer: Boolean(p.volunteerProfile && !p.volunteerProfile.deletedAt),
      existingDonor: p.donors[0] ?? null,
    }));
  }
}
