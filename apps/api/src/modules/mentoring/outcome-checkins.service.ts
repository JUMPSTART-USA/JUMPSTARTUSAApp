import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  CheckinWave,
  ListQuery,
  OutcomeCheckinCompleteInput,
  OutcomeCheckinScheduleInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface OutcomeCheckinListFilters {
  due?: 'overdue' | 'upcoming';
  wave?: CheckinWave;
  participantProfileId?: string;
}

const SORTABLE = new Set(['dueDate', 'completedDate', 'wave', 'createdAt']);

// §9.3 feed shows who the check-in is about and their graduation anchor date.
const PARTICIPANT_SUMMARY = {
  select: {
    id: true,
    participantNumber: true,
    graduationDate: true,
    person: { select: { firstName: true, lastName: true } },
  },
} as const;

/** @db.Date columns come back as UTC midnight — compare against the same. */
function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class OutcomeCheckinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: OutcomeCheckinListFilters) {
    const today = utcToday();
    const where: Prisma.OutcomeCheckinWhereInput = {
      ...(filters.wave ? { wave: filters.wave } : {}),
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      // due=overdue|upcoming both mean "not yet completed" (§9.3 work queue).
      ...(filters.due === 'overdue' ? { completedDate: null, dueDate: { lt: today } } : {}),
      ...(filters.due === 'upcoming' ? { completedDate: null, dueDate: { gte: today } } : {}),
      ...(query.search
        ? {
            participantProfile: {
              OR: [
                { participantNumber: { contains: query.search, mode: 'insensitive' } },
                {
                  person: {
                    OR: [
                      { firstName: { contains: query.search, mode: 'insensitive' } },
                      { lastName: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              ],
            },
          }
        : {}),
    };

    const orderBy: Prisma.OutcomeCheckinOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { dueDate: 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.outcomeCheckin.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { participantProfile: PARTICIPANT_SUMMARY },
      }),
      this.prisma.outcomeCheckin.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const checkin = await this.prisma.outcomeCheckin.findUnique({
      where: { id },
      include: { participantProfile: PARTICIPANT_SUMMARY },
    });
    if (!checkin) throw new NotFoundException('Outcome check-in not found');
    return checkin;
  }

  /**
   * Schedule one wave. skipDuplicates semantics on @@unique(participant, wave):
   * graduation auto-scheduling and manual scheduling can race — an existing
   * wave row is returned untouched, never an error and never a second row.
   */
  async schedule(input: OutcomeCheckinScheduleInput, userId: string) {
    const participant = await this.prisma.participantProfile.findFirst({
      where: { id: input.participantProfileId, deletedAt: null },
    });
    if (!participant) throw new BadRequestException('Participant not found');

    const existing = await this.prisma.outcomeCheckin.findUnique({
      where: {
        participantProfileId_wave: {
          participantProfileId: input.participantProfileId,
          wave: input.wave,
        },
      },
    });
    if (existing) return existing;

    const checkin = await this.prisma.outcomeCheckin.create({
      data: { ...input, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'outcome_checkin', checkin.id, checkin);
    return checkin;
  }

  /**
   * Capture outcome data. Per-field justice verification is enforced by the
   * shared schema (§9.3). Re-completing an already-completed check-in is
   * allowed as a correction path — the audit diff records what changed.
   */
  async complete(id: string, input: OutcomeCheckinCompleteInput, userId: string) {
    const existing = await this.get(id);

    const { wellbeingFields, ...rest } = input;
    const updated = await this.prisma.outcomeCheckin.update({
      where: { id },
      data: {
        ...rest,
        ...(wellbeingFields !== undefined
          ? { wellbeingFields: wellbeingFields as Prisma.InputJsonValue }
          : {}),
        collectedById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'outcome_checkin', id, existing, updated);
    return updated;
  }
}
