import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { InstitutionContactInput, InstitutionInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { applyMailingSameRule } from '../../common/mailing.util';
import { PrismaService } from '../../prisma/prisma.service';
import { hasPerm, type AuthenticatedUser } from '../../common/types';

export interface InstitutionListFilters {
  state?: string;
  active?: boolean;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['name', 'state', 'city', 'institutionType', 'createdAt']);

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: InstitutionListFilters) {
    const where: Prisma.InstitutionWhereInput = {
      deletedAt: null,
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
              {
                contacts: {
                  some: {
                    deletedAt: null,
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.InstitutionOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.institution.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          _count: {
            select: {
              insideClasses: { where: { deletedAt: null } },
              contacts: { where: { deletedAt: null } },
            },
          },
          contacts: {
            where: { deletedAt: null },
            select: { id: true, name: true, role: true },
            orderBy: [{ role: 'asc' }, { name: 'asc' }],
            take: 1,
          },
        },
      }),
      this.prisma.institution.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser) {
    const institution = await this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
    });
    if (!institution) throw new NotFoundException('Institution not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own state).
    assertChapterAccess(user.chapter, institution.state);
    return institution;
  }

  /** Institution profile page: contacts, classes held, participants served, volunteers (§6.2). */
  async profile(id: string, user: AuthenticatedUser) {
    const institution = await this.get(id, user);

    const contacts = await this.prisma.institutionContact.findMany({
      where: { institutionId: id, deletedAt: null },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    const [classes, participantsServed, volunteerAssignments] = await this.prisma.$transaction([
      this.prisma.insideClass.findMany({
        where: { institutionId: id, deletedAt: null },
        orderBy: { startDate: 'desc' },
        include: { _count: { select: { enrollments: { where: { deletedAt: null } } } } },
      }),
      this.prisma.insideClassEnrollment.findMany({
        where: { insideClass: { institutionId: id }, deletedAt: null },
        distinct: ['participantProfileId'],
        select: { participantProfileId: true },
      }),
      this.prisma.volunteerAssignment.findMany({
        where: { institutionId: id, deletedAt: null },
        include: {
          volunteerProfile: {
            include: { person: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { startDate: 'desc' },
      }),
    ]);

    // Currently housed (§6.1 inside locations): active location rows here.
    // Participant names need participants.read — the roster is OMITTED (not
    // empty) for viewers without it, so the SPA can hide the card entirely.
    const currentParticipants = hasPerm(user, 'participants.read')
      ? await this.prisma.participantInsideLocation.findMany({
          where: {
            institutionId: id,
            status: 'active',
            deletedAt: null,
            participantProfile: { deletedAt: null },
          },
          select: {
            id: true,
            startDate: true,
            participantProfile: {
              select: {
                id: true,
                participantNumber: true,
                insideStatus: true,
                person: { select: { firstName: true, lastName: true, preferredName: true } },
              },
            },
          },
          orderBy: { startDate: 'asc' },
        })
      : undefined;

    return {
      institution,
      contacts,
      classes,
      participantsServedCount: participantsServed.length,
      volunteerAssignments,
      ...(currentParticipants !== undefined ? { currentParticipants } : {}),
    };
  }

  // ── Contacts (chaplains, wardens, coordinators… — no limit) ────────────────

  async listContacts(id: string, user: AuthenticatedUser) {
    await this.get(id, user); // 404 + chapter check
    return this.prisma.institutionContact.findMany({
      where: { institutionId: id, deletedAt: null },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async createContact(id: string, input: InstitutionContactInput, user: AuthenticatedUser) {
    await this.get(id, user);
    const contact = await this.prisma.institutionContact.create({
      data: {
        ...this.contactData(input),
        institutionId: id,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    await this.audit.logCreate(user.id, 'institution_contact', contact.id, contact);
    return contact;
  }

  async updateContact(
    id: string,
    contactId: string,
    input: InstitutionContactInput,
    user: AuthenticatedUser,
  ) {
    await this.get(id, user);
    const existing = await this.prisma.institutionContact.findFirst({
      where: { id: contactId, institutionId: id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Contact not found');
    const updated = await this.prisma.institutionContact.update({
      where: { id: contactId },
      data: { ...this.contactData(input), updatedById: user.id },
    });
    await this.audit.logUpdate(user.id, 'institution_contact', contactId, existing, updated);
    return updated;
  }

  async deleteContact(id: string, contactId: string, user: AuthenticatedUser) {
    await this.get(id, user);
    const existing = await this.prisma.institutionContact.findFirst({
      where: { id: contactId, institutionId: id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Contact not found');
    await this.prisma.institutionContact.update({
      where: { id: contactId },
      data: { deletedAt: new Date(), updatedById: user.id },
    });
    await this.audit.logDelete(user.id, 'institution_contact', contactId, existing);
    return { ok: true };
  }

  /** Whole-record replacement: omitted optionals clear to null. */
  private contactData(input: InstitutionContactInput) {
    return {
      name: input.name,
      role: input.role,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
    };
  }

  async create(input: InstitutionInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): a scoped user cannot create for another chapter.
    assertChapterAccess(user.chapter, input.state);
    const institution = await this.prisma.institution.create({
      data: { ...applyMailingSameRule(input, true), createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'institution', institution.id, institution);
    return institution;
  }

  async update(id: string, input: Partial<InstitutionInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    // ...and a scoped user cannot move the record to another chapter either.
    assertChapterAccess(user.chapter, input.state);
    const updated = await this.prisma.institution.update({
      where: { id },
      data: { ...applyMailingSameRule(input, existing.mailingSameAsPrimary), updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'institution', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.get(id, user); // chapter check inside
    await this.prisma.institution.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'institution', id, existing);
    return { ok: true };
  }
}
