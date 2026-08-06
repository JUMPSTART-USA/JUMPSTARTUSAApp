import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BackgroundCheck, Prisma } from '@jumpstart/database';
import type {
  BackgroundCheckInput,
  ClearanceRequirementInput,
  ClearanceRequirementType,
  ClearanceStatus,
  ListQuery,
  VolunteerClearanceInput,
  VolunteerTrainingInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

/**
 * §7.2 field class: background-check adjudication results are visible only
 * with fields.background_checks.read. Everyone with volunteers.read may see
 * that a check exists and when it was ordered/completed — never the outcome.
 */
export function redactBackgroundCheck<T extends BackgroundCheck>(
  check: T,
  canReadResults: boolean,
): T | Omit<T, 'result' | 'expiresAt' | 'notes'> {
  if (canReadResults) return check;
  const { result, expiresAt, notes, ...visible } = check;
  return visible;
}

/** One un-met facility requirement, as surfaced by eligibility computation (§6.6). */
export interface MissingClearance {
  requirement: {
    id: string;
    name: string;
    requirementType: ClearanceRequirementType;
    hardBlock: boolean;
  };
  status: ClearanceStatus | 'missing';
  expiresAt: Date | null;
}

// result/expiresAt deliberately excluded — sorting by a restricted-field-class
// column would leak its values through row ordering (§7.2).
const CHECK_SORTABLE = new Set(['orderedAt', 'completedAt', 'vendor', 'createdAt']);
const TRAINING_SORTABLE = new Set(['trainingType', 'completedAt', 'expiresAt', 'createdAt']);
const REQUIREMENT_SORTABLE = new Set(['name', 'requirementType', 'createdAt']);
const CLEARANCE_SORTABLE = new Set(['status', 'issuedAt', 'expiresAt', 'createdAt']);

const PERSON_NAME_SELECT = { id: true, firstName: true, lastName: true } as const;

@Injectable()
export class ScreeningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Eligibility (computed, never stored — §6.6) ───────────────────────────

  /**
   * Eligible at institution X iff every ACTIVE requirement of X has a
   * clearance with status `satisfied` and no past expiry date.
   */
  async computeEligibility(volunteerProfileId: string, institutionId: string, user: AuthenticatedUser) {
    const [profile, institution] = await this.prisma.$transaction([
      this.prisma.volunteerProfile.findFirst({
        where: { id: volunteerProfileId, deletedAt: null },
        include: { person: { select: { state: true } } },
      }),
      this.prisma.institution.findFirst({ where: { id: institutionId, deletedAt: null } }),
    ]);
    if (!profile) throw new NotFoundException('Volunteer not found');
    if (!institution) throw new NotFoundException('Institution not found');
    // Chapter scoping (§7.2): same derivation as the volunteer get-by-id guard.
    assertChapterAccess(user.chapter, profile.person.state);

    const requirements = await this.prisma.facilityClearanceRequirement.findMany({
      where: { institutionId, active: true },
      orderBy: { name: 'asc' },
    });
    if (requirements.length === 0) return { eligible: true, missing: [] as MissingClearance[] };

    const clearances = await this.prisma.volunteerClearance.findMany({
      where: { volunteerProfileId, requirementId: { in: requirements.map((r) => r.id) } },
    });
    const byRequirement = new Map(clearances.map((c) => [c.requirementId, c]));

    const now = new Date();
    const missing: MissingClearance[] = [];
    for (const req of requirements) {
      const clearance = byRequirement.get(req.id);
      const satisfied =
        clearance?.status === 'satisfied' &&
        (clearance.expiresAt === null || clearance.expiresAt >= now);
      if (satisfied) continue;
      // A `satisfied` row past its expiry is reported as expired even if the
      // stored status was never flipped.
      const lapsed = clearance?.status === 'satisfied';
      missing.push({
        requirement: {
          id: req.id,
          name: req.name,
          requirementType: req.requirementType,
          hardBlock: req.hardBlock,
        },
        status: clearance ? (lapsed ? 'expired' : clearance.status) : 'missing',
        expiresAt: clearance?.expiresAt ?? null,
      });
    }
    return { eligible: missing.length === 0, missing };
  }

  // ── Expiration dashboard (§6.6) ───────────────────────────────────────────

  /**
   * Everything lapsing within `days`. Already-lapsed items are included — they
   * still need coordinator action and must not silently disappear.
   */
  async expirations(days: number, canReadCheckResults: boolean) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const [trainings, clearances] = await this.prisma.$transaction([
      this.prisma.volunteerTraining.findMany({
        where: { expiresAt: { not: null, lte: cutoff }, volunteerProfile: { deletedAt: null } },
        include: {
          volunteerProfile: { select: { id: true, person: { select: PERSON_NAME_SELECT } } },
        },
        orderBy: { expiresAt: 'asc' },
      }),
      this.prisma.volunteerClearance.findMany({
        where: {
          expiresAt: { not: null, lte: cutoff },
          status: 'satisfied',
          volunteerProfile: { deletedAt: null },
        },
        include: {
          volunteerProfile: { select: { id: true, person: { select: PERSON_NAME_SELECT } } },
          requirement: {
            select: {
              id: true,
              name: true,
              requirementType: true,
              hardBlock: true,
              institution: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { expiresAt: 'asc' },
      }),
    ]);

    // Check expiry dates belong to the restricted field class (§7.2): users
    // without fields.background_checks.read get an empty section, not a
    // stripped one.
    const backgroundChecks = canReadCheckResults
      ? await this.prisma.backgroundCheck.findMany({
          where: {
            expiresAt: { not: null, lte: cutoff },
            person: { deletedAt: null, volunteerProfile: { deletedAt: null } },
          },
          include: {
            person: {
              select: { ...PERSON_NAME_SELECT, volunteerProfile: { select: { id: true } } },
            },
          },
          orderBy: { expiresAt: 'asc' },
        })
      : [];

    return { days, backgroundChecks, trainings, clearances };
  }

  // ── Background checks (adjudication result only — §7.4) ───────────────────

  async listChecks(
    query: ListQuery,
    personId: string | undefined,
    canReadResults: boolean,
    chapter: string | null,
  ) {
    const where: Prisma.BackgroundCheckWhereInput = {
      // Chapter scoping (§7.2): same derivation as the volunteers list (person.state).
      ...(chapter ? { person: { state: chapter } } : {}),
      ...(personId ? { personId } : {}),
      ...(query.search
        ? {
            OR: [
              { vendor: { contains: query.search, mode: 'insensitive' } },
              { person: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { person: { lastName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.BackgroundCheckOrderByWithRelationInput =
      query.sortBy && CHECK_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { orderedAt: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.backgroundCheck.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { person: { select: PERSON_NAME_SELECT } },
      }),
      this.prisma.backgroundCheck.count({ where }),
    ]);

    const items = rows.map(({ person, ...check }) => ({
      ...redactBackgroundCheck(check, canReadResults),
      person,
    }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createCheck(input: BackgroundCheckInput, userId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id: input.personId, deletedAt: null },
    });
    if (!person) throw new NotFoundException('Person not found');

    const check = await this.prisma.backgroundCheck.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'background_check', check.id, check);
    return check;
  }

  // personId is create-only — the PATCH schema omits it so a recorded check
  // can never be repointed to another person.
  async updateCheck(
    id: string,
    input: Partial<Omit<BackgroundCheckInput, 'personId'>>,
    userId: string,
  ) {
    const existing = await this.prisma.backgroundCheck.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Background check not found');

    const updated = await this.prisma.backgroundCheck.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'background_check', id, existing, updated);
    return updated;
  }

  // ── Trainings ─────────────────────────────────────────────────────────────

  async listTrainings(
    query: ListQuery,
    volunteerProfileId: string | undefined,
    chapter: string | null,
  ) {
    const where: Prisma.VolunteerTrainingWhereInput = {
      // Chapter scoping (§7.2): same derivation as the volunteers list (person.state).
      ...(chapter ? { volunteerProfile: { person: { state: chapter } } } : {}),
      ...(volunteerProfileId ? { volunteerProfileId } : {}),
      ...(query.search
        ? { trainingType: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const orderBy: Prisma.VolunteerTrainingOrderByWithRelationInput =
      query.sortBy && TRAINING_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { completedAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.volunteerTraining.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          volunteerProfile: { select: { id: true, person: { select: PERSON_NAME_SELECT } } },
        },
      }),
      this.prisma.volunteerTraining.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createTraining(input: VolunteerTrainingInput, userId: string) {
    const profile = await this.prisma.volunteerProfile.findFirst({
      where: { id: input.volunteerProfileId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Volunteer not found');

    const training = await this.prisma.volunteerTraining.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'volunteer_training', training.id, training);
    return training;
  }

  // volunteerProfileId is create-only — the PATCH schema omits it.
  async updateTraining(
    id: string,
    input: Partial<Omit<VolunteerTrainingInput, 'volunteerProfileId'>>,
    userId: string,
  ) {
    const existing = await this.prisma.volunteerTraining.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Training record not found');

    const updated = await this.prisma.volunteerTraining.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'volunteer_training', id, existing, updated);
    return updated;
  }

  // No deletedAt column — delete exists for corrections only; the audit row
  // preserves the removed record.
  async deleteTraining(id: string, userId: string) {
    const existing = await this.prisma.volunteerTraining.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Training record not found');

    await this.prisma.volunteerTraining.delete({ where: { id } });
    await this.audit.logDelete(userId, 'volunteer_training', id, existing);
    return { ok: true };
  }

  // ── Facility clearance requirements (per-institution data, assumption #11) ─

  async listRequirements(
    query: ListQuery,
    filters: { institutionId?: string; active?: boolean },
  ) {
    const where: Prisma.FacilityClearanceRequirementWhereInput = {
      ...(filters.institutionId ? { institutionId: filters.institutionId } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const orderBy: Prisma.FacilityClearanceRequirementOrderByWithRelationInput =
      query.sortBy && REQUIREMENT_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { name: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.facilityClearanceRequirement.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { institution: { select: { id: true, name: true, state: true } } },
      }),
      this.prisma.facilityClearanceRequirement.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createRequirement(input: ClearanceRequirementInput, userId: string) {
    const institution = await this.prisma.institution.findFirst({
      where: { id: input.institutionId, deletedAt: null },
    });
    if (!institution) throw new NotFoundException('Institution not found');

    const requirement = await this.prisma.facilityClearanceRequirement.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'facility_clearance_requirement', requirement.id, requirement);
    return requirement;
  }

  async updateRequirement(id: string, input: Partial<ClearanceRequirementInput>, userId: string) {
    const existing = await this.prisma.facilityClearanceRequirement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Clearance requirement not found');

    const updated = await this.prisma.facilityClearanceRequirement.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'facility_clearance_requirement', id, existing, updated);
    return updated;
  }

  // Requirements that clearances already reference are history — retire them
  // with active=false instead of deleting (assumption #11).
  async deleteRequirement(id: string, userId: string) {
    const existing = await this.prisma.facilityClearanceRequirement.findUnique({
      where: { id },
      include: { _count: { select: { clearances: true } } },
    });
    if (!existing) throw new NotFoundException('Clearance requirement not found');
    if (existing._count.clearances > 0) {
      throw new ConflictException(
        'Requirement has recorded clearances — set active=false to retire it instead of deleting',
      );
    }

    await this.prisma.facilityClearanceRequirement.delete({ where: { id } });
    await this.audit.logDelete(userId, 'facility_clearance_requirement', id, existing);
    return { ok: true };
  }

  // ── Volunteer clearances (volunteer × requirement) ────────────────────────

  async listClearances(
    query: ListQuery,
    filters: {
      volunteerProfileId?: string;
      requirementId?: string;
      institutionId?: string;
      status?: ClearanceStatus;
    },
    chapter: string | null,
  ) {
    const where: Prisma.VolunteerClearanceWhereInput = {
      // Chapter scoping (§7.2): same derivation as the volunteers list (person.state).
      ...(chapter ? { volunteerProfile: { person: { state: chapter } } } : {}),
      ...(filters.volunteerProfileId ? { volunteerProfileId: filters.volunteerProfileId } : {}),
      ...(filters.requirementId ? { requirementId: filters.requirementId } : {}),
      ...(filters.institutionId ? { requirement: { institutionId: filters.institutionId } } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(query.search
        ? {
            OR: [
              { requirement: { name: { contains: query.search, mode: 'insensitive' } } },
              {
                volunteerProfile: {
                  person: { lastName: { contains: query.search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.VolunteerClearanceOrderByWithRelationInput =
      query.sortBy && CLEARANCE_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.volunteerClearance.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          volunteerProfile: { select: { id: true, person: { select: PERSON_NAME_SELECT } } },
          requirement: {
            select: {
              id: true,
              name: true,
              requirementType: true,
              hardBlock: true,
              institution: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.volunteerClearance.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * volunteerProfileId+requirementId is unique — POST updates the existing row
   * instead of failing, so re-recording a renewal is one call.
   */
  async upsertClearance(input: VolunteerClearanceInput, userId: string) {
    const [profile, requirement] = await this.prisma.$transaction([
      this.prisma.volunteerProfile.findFirst({
        where: { id: input.volunteerProfileId, deletedAt: null },
      }),
      this.prisma.facilityClearanceRequirement.findUnique({
        where: { id: input.requirementId },
      }),
    ]);
    if (!profile) throw new NotFoundException('Volunteer not found');
    if (!requirement) throw new NotFoundException('Clearance requirement not found');

    const existing = await this.prisma.volunteerClearance.findUnique({
      where: {
        volunteerProfileId_requirementId: {
          volunteerProfileId: input.volunteerProfileId,
          requirementId: input.requirementId,
        },
      },
    });

    if (existing) {
      const updated = await this.prisma.volunteerClearance.update({
        where: { id: existing.id },
        data: { ...input, updatedById: userId },
      });
      await this.audit.logUpdate(userId, 'volunteer_clearance', existing.id, existing, updated);
      return updated;
    }

    const clearance = await this.prisma.volunteerClearance.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'volunteer_clearance', clearance.id, clearance);
    return clearance;
  }

  // volunteerProfileId/requirementId are create-only — the PATCH schema omits
  // them (renewals go through the POST upsert).
  async updateClearance(
    id: string,
    input: Partial<Omit<VolunteerClearanceInput, 'volunteerProfileId' | 'requirementId'>>,
    userId: string,
  ) {
    const existing = await this.prisma.volunteerClearance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Clearance not found');

    const updated = await this.prisma.volunteerClearance.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });
    await this.audit.logUpdate(userId, 'volunteer_clearance', id, existing, updated);
    return updated;
  }

  // No deletedAt column — delete exists for corrections only (audit keeps the row).
  async deleteClearance(id: string, userId: string) {
    const existing = await this.prisma.volunteerClearance.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Clearance not found');

    await this.prisma.volunteerClearance.delete({ where: { id } });
    await this.audit.logDelete(userId, 'volunteer_clearance', id, existing);
    return { ok: true };
  }
}
