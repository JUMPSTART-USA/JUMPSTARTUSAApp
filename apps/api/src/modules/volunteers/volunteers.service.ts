import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  ListQuery,
  PersonCoreInput,
  VolunteerCreateInput,
  VolunteerStatus,
  VolunteerUpdateInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess, resolveCreateChapter } from '../../common/chapter.util';
import { applyMailingSameRule } from '../../common/mailing.util';
import {
  CLEAR_PHOTO_COLUMNS,
  photoColumns,
  type StoredPhoto,
  type UploadedPhotoFile,
} from '../../common/profile-photo.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { redactBackgroundCheck } from './screening.service';

export interface VolunteerListFilters {
  /** A single record, for a picker turning an id from a URL back into a name. */
  id?: string;
  /** The person behind the profile — see the participants controller. */
  personId?: string;
  status?: VolunteerStatus;
  isMentor?: boolean;
  state?: string;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked. Person columns sort through the relation.
const SORTABLE = new Set(['status', 'createdAt']);
const PERSON_SORTABLE = new Set(['lastName', 'firstName', 'state']);

const PERSON_BASICS_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  primaryEmail: true,
  primaryPhone: true,
  city: true,
  state: true,
} as const;

@Injectable()
export class VolunteersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: VolunteerListFilters, canReadCheckResults: boolean) {
    const where: Prisma.VolunteerProfileWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.isMentor !== undefined ? { isMentor: filters.isMentor } : {}),
      // Chapter scoping (§7.2): own chapter column — person.state is a mailing
      // address, never the chapter.
      ...(filters.state ? { chapterState: filters.state } : {}),
      // A picker rehydrating one id, INSIDE this where so the chapter clause
      // above still applies: another chapter's id returns an empty page.
      ...(filters.id ? { id: filters.id } : {}),
      person: {
        deletedAt: null,
        ...(filters.personId ? { id: filters.personId } : {}),
        ...(query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { preferredName: { contains: query.search, mode: 'insensitive' } },
                { primaryEmail: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const orderBy: Prisma.VolunteerProfileOrderByWithRelationInput =
      query.sortBy && PERSON_SORTABLE.has(query.sortBy)
        ? { person: { [query.sortBy]: query.sortDir } }
        : query.sortBy && SORTABLE.has(query.sortBy)
          ? { [query.sortBy]: query.sortDir }
          : { person: { lastName: 'asc' } };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.volunteerProfile.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          person: {
            select: {
              ...PERSON_BASICS_SELECT,
              backgroundChecks: { orderBy: { orderedAt: 'desc' }, take: 1 },
            },
          },
        },
      }),
      this.prisma.volunteerProfile.count({ where }),
    ]);

    const items = rows.map((row) => {
      const { backgroundChecks, ...person } = row.person;
      const latest = backgroundChecks[0];
      return {
        ...row,
        person,
        latestBackgroundCheck: latest ? redactBackgroundCheck(latest, canReadCheckResults) : null,
      };
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser, canReadCheckResults: boolean) {
    const profile = await this.prisma.volunteerProfile.findFirst({
      where: { id, deletedAt: null },
      include: {
        person: { include: { backgroundChecks: { orderBy: { orderedAt: 'desc' } } } },
        assignments: {
          where: { deletedAt: null },
          orderBy: { startDate: 'desc' },
          include: {
            institution: { select: { id: true, name: true } },
            insideClass: { select: { id: true, name: true } },
            outsideProgram: { select: { id: true, name: true } },
            event: { select: { id: true, name: true } },
          },
        },
        trainings: { orderBy: { completedAt: 'desc' } },
        clearances: {
          orderBy: { createdAt: 'desc' },
          include: {
            requirement: {
              select: {
                id: true,
                name: true,
                requirementType: true,
                hardBlock: true,
                renewalMonths: true,
                institution: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException('Volunteer not found');
    // Chapter scoping (§7.2): same derivation as the list filter (chapterState).
    assertChapterAccess(user.chapter, profile.chapterState);

    // Hours summary + next shifts are COMPUTED, never stored (§6.6).
    const now = new Date();
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    // shiftDate is a @db.Date (UTC midnight) — compare against UTC midnight today.
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [approvedSum, ytdSum, pendingCount, upcomingSignups] = await this.prisma.$transaction([
      this.prisma.volunteerHoursEntry.aggregate({
        where: { volunteerProfileId: id, status: 'approved', deletedAt: null },
        _sum: { hours: true },
      }),
      this.prisma.volunteerHoursEntry.aggregate({
        where: {
          volunteerProfileId: id,
          status: 'approved',
          deletedAt: null,
          activityDate: { gte: yearStart },
        },
        _sum: { hours: true },
      }),
      this.prisma.volunteerHoursEntry.count({
        where: { volunteerProfileId: id, status: 'pending', deletedAt: null },
      }),
      this.prisma.volunteerShiftSignup.findMany({
        where: {
          volunteerProfileId: id,
          status: { in: ['signed_up', 'confirmed', 'waitlisted'] },
          shift: { deletedAt: null, shiftDate: { gte: today }, opportunity: { deletedAt: null } },
        },
        orderBy: [{ shift: { shiftDate: 'asc' } }, { shift: { startTime: 'asc' } }],
        take: 5,
        include: {
          shift: {
            select: {
              id: true,
              shiftDate: true,
              startTime: true,
              endTime: true,
              role: true,
              location: true,
              opportunity: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const { backgroundChecks, ...person } = profile.person;
    return {
      ...profile,
      person,
      backgroundChecks: backgroundChecks.map((c) => redactBackgroundCheck(c, canReadCheckResults)),
      hoursSummary: {
        totalApproved: Number(approvedSum._sum.hours ?? 0),
        ytdApproved: Number(ytdSum._sum.hours ?? 0),
        pendingCount,
      },
      upcomingSignups,
    };
  }

  async create(input: VolunteerCreateInput, user: AuthenticatedUser) {
    const userId = user.id;
    // Chapter scoping (§7.2): stamp the creator's chapter — all-chapters users
    // must pick one explicitly. person.state is a mailing address, not checked.
    const chapterState = resolveCreateChapter(user.chapter, input.chapterState);
    // §5 duplicate prevention: person-creating flows surface candidate matches
    // first; the client re-submits with confirmNotDuplicate once staff verify.
    if (!input.confirmNotDuplicate) {
      const candidates = await this.findDuplicateCandidates(input.person);
      if (candidates.length > 0) {
        throw new ConflictException({
          message:
            'Possible duplicate person(s) found — re-submit with confirmNotDuplicate to create anyway',
          candidates,
        });
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          ...applyMailingSameRule(input.person, true, { hasLine2: true }),
          createdById: userId,
          updatedById: userId,
        },
      });
      const profile = await tx.volunteerProfile.create({
        data: {
          ...input.profile,
          chapterState,
          personId: person.id,
          createdById: userId,
          updatedById: userId,
        },
      });
      return { ...profile, person };
    });

    const { person, ...profileOnly } = created;
    await this.audit.logCreate(userId, 'person', person.id, person);
    await this.audit.logCreate(userId, 'volunteer_profile', created.id, profileOnly);
    return created;
  }

  async update(id: string, input: VolunteerUpdateInput, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerProfile.findFirst({
      where: { id, deletedAt: null },
      include: { person: true },
    });
    if (!existing) throw new NotFoundException('Volunteer not found');
    // Chapter scoping (§7.2): same derivation as the list filter (chapterState).
    // person.state is a mailing address — updating it is not a chapter move.
    assertChapterAccess(user.chapter, existing.chapterState);
    const { person: existingPerson, ...existingProfile } = existing;

    const result = await this.prisma.$transaction(async (tx) => {
      const person = input.person
        ? await tx.person.update({
            where: { id: existing.personId },
            data: {
              ...applyMailingSameRule(input.person, existingPerson.mailingSameAsPrimary, {
                hasLine2: true,
              }),
              updatedById: userId,
            },
          })
        : existingPerson;
      const profile = input.profile
        ? await tx.volunteerProfile.update({
            where: { id },
            data: { ...input.profile, updatedById: userId },
          })
        : existingProfile;
      return { person, profile };
    });

    if (input.person) {
      await this.audit.logUpdate(userId, 'person', existing.personId, existingPerson, result.person);
    }
    if (input.profile) {
      await this.audit.logUpdate(userId, 'volunteer_profile', id, existingProfile, result.profile);
    }
    return { ...result.profile, person: result.person };
  }

  // ── Profile photo (drug-test photo contract: bytes live on the person row,
  // the photo GET is the only reader, a new upload replaces the stored one) ──

  async setPhoto(id: string, photo: UploadedPhotoFile, user: AuthenticatedUser) {
    const existing = await this.findForPhoto(id, user);
    await this.prisma.person.update({
      where: { id: existing.personId },
      data: { ...photoColumns(photo), updatedById: user.id },
    });
    // Audit the metadata, never the bytes.
    await this.audit.logUpdate(user.id, 'person', existing.personId, existing.person, {
      photoFileName: photo.originalname,
      photoMimeType: photo.mimetype,
    });
    return { hasPhoto: true };
  }

  async clearPhoto(id: string, user: AuthenticatedUser) {
    const existing = await this.findForPhoto(id, user);
    await this.prisma.person.update({
      where: { id: existing.personId },
      data: { ...CLEAR_PHOTO_COLUMNS, updatedById: user.id },
    });
    await this.audit.logUpdate(user.id, 'person', existing.personId, existing.person, {
      photoFileName: null,
      photoMimeType: null,
    });
    return { hasPhoto: false };
  }

  /** The one query allowed to read photoData — streams bytes to the caller. */
  async getPhoto(id: string, viewer: AuthenticatedUser): Promise<StoredPhoto> {
    const profile = await this.prisma.volunteerProfile.findFirst({
      where: { id, deletedAt: null },
      select: {
        chapterState: true,
        person: { select: { photoData: true, photoMimeType: true, photoFileName: true } },
      },
    });
    if (!profile) throw new NotFoundException('Volunteer not found');
    // Chapter scoping (§7.2): the photo is guarded exactly like the record.
    assertChapterAccess(viewer.chapter, profile.chapterState);
    const { photoData, photoMimeType, photoFileName } = profile.person;
    if (!photoData || !photoMimeType) {
      throw new NotFoundException('This volunteer has no photo');
    }
    return {
      data: Buffer.from(photoData),
      mimeType: photoMimeType,
      fileName: photoFileName ?? 'photo',
    };
  }

  /** Fetch-for-photo-mutation with the chapter guard (§7.2) applied once. */
  private async findForPhoto(id: string, user: AuthenticatedUser) {
    const profile = await this.prisma.volunteerProfile.findFirst({
      where: { id, deletedAt: null },
      select: {
        personId: true,
        chapterState: true,
        person: { select: { photoFileName: true, photoMimeType: true } },
      },
    });
    if (!profile) throw new NotFoundException('Volunteer not found');
    assertChapterAccess(user.chapter, profile.chapterState);
    return profile;
  }

  // Soft-deletes the profile only — the person may hold other roles (§5).
  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.prisma.volunteerProfile.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Volunteer not found');
    // Chapter scoping (§7.2): same derivation as the list filter (chapterState).
    assertChapterAccess(user.chapter, existing.chapterState);

    await this.prisma.volunteerProfile.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'volunteer_profile', id, existing);
    return { ok: true };
  }

  /** Volunteer service report: where, when, in what role (§6.6). */
  async serviceHistory(id: string, user: AuthenticatedUser) {
    const profile = await this.prisma.volunteerProfile.findFirst({
      where: { id, deletedAt: null },
      include: { person: { select: { id: true, firstName: true, lastName: true, state: true } } },
    });
    if (!profile) throw new NotFoundException('Volunteer not found');
    // Chapter scoping (§7.2): same derivation as get() and the list filter.
    assertChapterAccess(user.chapter, profile.chapterState);

    const [assignments, approvedSum] = await this.prisma.$transaction([
      this.prisma.volunteerAssignment.findMany({
        where: { volunteerProfileId: id, deletedAt: null },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          institution: { select: { id: true, name: true, state: true } },
          insideClass: { select: { id: true, name: true } },
          outsideProgram: { select: { id: true, name: true, programType: true } },
          event: { select: { id: true, name: true, eventDate: true } },
        },
      }),
      this.prisma.volunteerHoursEntry.aggregate({
        where: { volunteerProfileId: id, status: 'approved', deletedAt: null },
        _sum: { hours: true },
      }),
    ]);

    return {
      volunteer: profile,
      assignments,
      totalApprovedHours: Number(approvedSum._sum.hours ?? 0),
    };
  }

  private findDuplicateCandidates(person: PersonCoreInput) {
    const or: Prisma.PersonWhereInput[] = [
      {
        AND: [
          { firstName: { equals: person.firstName, mode: 'insensitive' } },
          { lastName: { equals: person.lastName, mode: 'insensitive' } },
        ],
      },
    ];
    if (person.dateOfBirth) {
      or.push({
        AND: [
          { lastName: { equals: person.lastName, mode: 'insensitive' } },
          { dateOfBirth: person.dateOfBirth },
        ],
      });
    }
    if (person.primaryEmail) {
      or.push({ primaryEmail: { equals: person.primaryEmail, mode: 'insensitive' } });
    }
    if (person.primaryPhone) or.push({ primaryPhone: person.primaryPhone });

    return this.prisma.person.findMany({
      where: { deletedAt: null, OR: or },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        primaryEmail: true,
        primaryPhone: true,
        city: true,
        state: true,
        // Lets staff link to an existing volunteer instead of creating anew.
        volunteerProfile: { select: { id: true, status: true, deletedAt: true } },
      },
      take: 10,
    });
  }
}
