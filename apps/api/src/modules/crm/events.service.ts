import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Event, Prisma } from '@jumpstart/database';
import type { EventInput, EventRegistrationInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface EventListFilters {
  eventType?: string;
  campaignId?: string;
  from?: Date;
  to?: Date;
}

/** Registration payloads take eventId from the route, not the body. */
export type RegistrationCreate = Omit<EventRegistrationInput, 'eventId'>;
export type RegistrationUpdate = Partial<RegistrationCreate>;

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'eventDate', 'eventType', 'createdAt']);

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

  async get(id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: { campaign: { select: { id: true, name: true } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /** Event detail: registrations, linked gift revenue, computed net (§6.8). */
  async detail(id: string) {
    const event = await this.get(id);

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
  async financialSummary(id: string) {
    const event = await this.get(id);
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

  async create(input: EventInput, userId: string) {
    await this.assertCampaignExists(input.campaignId);
    const event = await this.prisma.event.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'event', event.id, event);
    return event;
  }

  async update(id: string, input: Partial<EventInput>, userId: string) {
    const existing = await this.get(id);
    await this.assertCampaignExists(input.campaignId);
    const updated = await this.prisma.event.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'event', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.get(id);
    await this.prisma.event.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'event', id, existing);
    return { ok: true };
  }

  // ── Registrations ─────────────────────────────────────────────────────────
  // No soft delete: cancellations keep the row with status 'canceled'.

  async addRegistration(eventId: string, input: RegistrationCreate, userId: string) {
    await this.get(eventId);

    // Re-enforced from the shared schema — the route body omits eventId, so the
    // schema's person-or-guest refinement can't run at the pipe.
    if (!input.personId && !input.externalName) {
      throw new BadRequestException('Select a person or enter a guest name');
    }

    if (input.personId) {
      const person = await this.prisma.person.findFirst({
        where: { id: input.personId, deletedAt: null },
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

  async updateRegistration(id: string, input: RegistrationUpdate, userId: string) {
    const existing = await this.prisma.eventRegistration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Registration not found');

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
    await this.audit.logUpdate(userId, 'event_registration', id, existing, updated);
    return updated;
  }

  private async assertCampaignExists(campaignId?: string | null) {
    if (!campaignId) return;
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, deletedAt: null },
    });
    if (!campaign) throw new BadRequestException('Campaign not found');
  }
}
