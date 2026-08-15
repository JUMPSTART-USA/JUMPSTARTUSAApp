import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Event, Prisma } from '@jumpstart/database';
import type { EventInput, EventRegistrationInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface EventListFilters {
  eventType?: string;
  campaignId?: string;
  from?: Date;
  to?: Date;
  /** Chapter filter — matches the `chapterState` column (§7.2). */
  chapterState?: string;
}

/** Registration payloads take eventId from the route, not the body. */
export type RegistrationCreate = Omit<EventRegistrationInput, 'eventId'>;
export type RegistrationUpdate = Partial<RegistrationCreate>;

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'eventDate', 'eventType', 'chapterState', 'createdAt']);

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: EventListFilters) {
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      ...(filters.eventType
        ? { eventType: { contains: filters.eventType, mode: 'insensitive' } }
        : {}),
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.chapterState ? { chapterState: filters.chapterState } : {}),
      ...(filters.from || filters.to
        ? {
            eventDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.EventOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { eventDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          campaign: { select: { id: true, name: true } },
          _count: { select: { registrations: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const event = await this.prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: { campaign: { select: { id: true, name: true } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(user.chapter, event.chapterState);
    return event;
  }

  /** Event detail: registrations, linked gift revenue, computed net (§6.8). */
  async detail(id: string, user: AuthenticatedUser) {
    const event = await this.get(id, user);

    const [registrations, donationAgg] = await this.prisma.$transaction([
      this.prisma.eventRegistration.findMany({
        where: { eventId: id },
        orderBy: { createdAt: 'asc' },
        include: { person: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.donation.aggregate({
        where: { eventId: id, deletedAt: null },
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    return {
      event,
      registrations,
      ...this.financials(event, donationAgg._count, Number(donationAgg._sum.amount ?? 0)),
    };
  }

  /** Event financial summary report (§6.8 event lifecycle). */
  async financialSummary(id: string, user: AuthenticatedUser) {
    const event = await this.get(id, user); // chapter check inside
    const donationAgg = await this.prisma.donation.aggregate({
      where: { eventId: id, deletedAt: null },
      _count: true,
      _sum: { amount: true },
    });
    return this.financials(event, donationAgg._count, Number(donationAgg._sum.amount ?? 0));
  }

  private financials(event: Event, donationCount: number, donationTotal: number) {
    const revenue = Number(event.revenue ?? 0);
    const expenses = Number(event.expenses ?? 0);
    return {
      revenue,
      expenses,
      net: revenue - expenses,
      donationsLinked: { count: donationCount, total: donationTotal },
    };
  }

  async create(input: EventInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): the creator decides the chapter — scoped users
    // get theirs stamped, all-chapters users must pick one.
    const chapterState = resolveCreateChapter(user.chapter, input.chapterState);
    await this.assertCampaignRef(input.campaignId, chapterState);
    const event = await this.prisma.event.create({
      data: { ...input, chapterState, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'event', event.id, event);
    return event;
  }

  async update(id: string, input: Partial<EventInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    // ...and a scoped user cannot move the record to another chapter either.
    assertChapterAccess(user.chapter, input.chapterState ?? null);
    // A linked campaign must live in the event's (merged) chapter.
    const chapterState = input.chapterState ?? existing.chapterState;
    const campaignId = input.campaignId !== undefined ? input.campaignId : existing.campaignId;
    await this.assertCampaignRef(campaignId, chapterState);
    const updated = await this.prisma.event.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'event', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    await this.prisma.event.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'event', id, existing);
    return { ok: true };
  }

  // ── Registrations ─────────────────────────────────────────────────────────
  // No soft delete: cancellations keep the row with status 'canceled'.

  async addRegistration(eventId: string, input: RegistrationCreate, user: AuthenticatedUser) {
    const userId = user.id;
    await this.get(eventId, user); // 404 + chapter check

    // Re-enforced from the shared schema — the route body omits eventId, so the
    // schema's person-or-guest refinement can't run at the pipe.
    if (!input.personId && !input.externalName) {
      throw new BadRequestException('Select a person or enter a guest name');
    }

    if (input.personId) {
      const person = await this.prisma.person.findFirst({
        where: {
          id: input.personId,
          deletedAt: null,
          // Chapter scoping (§7.2): scoped users only register their chapter's
          // people (profile chapter); profile-less people are chapter-neutral.
          ...(user.chapter
            ? {
                AND: [
                  {
                    OR: [
                      { participantProfile: null },
                      { participantProfile: { chapterState: user.chapter } },
                    ],
                  },
                  {
                    OR: [
                      { volunteerProfile: null },
                      { volunteerProfile: { chapterState: user.chapter } },
                    ],
                  },
                ],
              }
            : {}),
        },
      });
      if (!person) throw new BadRequestException('Person not found');

      const duplicate = await this.prisma.eventRegistration.findFirst({
        where: { eventId, personId: input.personId, status: { not: 'canceled' } },
      });
      if (duplicate) {
        throw new ConflictException('Person is already registered for this event');
      }
    }

    const registration = await this.prisma.eventRegistration.create({
      data: {
        ...input,
        eventId,
        // Walk-ins recorded straight as attended are checked in on the spot.
        ...(input.status === 'attended' ? { checkedInAt: new Date() } : {}),
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'event_registration', registration.id, registration);
    return registration;
  }

  async updateRegistration(id: string, input: RegistrationUpdate, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.eventRegistration.findUnique({
      where: { id },
      include: { event: { select: { chapterState: true } } },
    });
    if (!existing) throw new NotFoundException('Registration not found');
    // Chapter scoping (§7.2): derived through the parent event.
    assertChapterAccess(user.chapter, existing.event.chapterState);
    const { event: _event, ...registrationOnly } = existing;

    const updated = await this.prisma.eventRegistration.update({
      where: { id },
      data: {
        ...input,
        // Check-in list flow (§6.8): marking attended stamps the check-in time.
        ...(input.status === 'attended' && !existing.checkedInAt
          ? { checkedInAt: new Date() }
          : {}),
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'event_registration', id, registrationOnly, updated);
    return updated;
  }

  /** A linked campaign must exist and live in the event's chapter. */
  private async assertCampaignRef(campaignId: string | null | undefined, chapterState: string) {
    if (!campaignId) return;
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, deletedAt: null },
    });
    if (!campaign) throw new BadRequestException('Campaign not found');
    if (campaign.chapterState !== chapterState) {
      throw new BadRequestException('Campaign belongs to another chapter');
    }
  }
}
