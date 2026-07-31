import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  ListQuery,
  TravelDecisionInput,
  TravelRequestInput,
  TravelRequestStatus,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertParticipant } from './participant.util';

export type TravelRequestCreateInput = TravelRequestInput;
/** PATCH may touch trip fields only — never participant/status/decision columns. */
export type TravelRequestUpdateInput = Partial<
  Pick<TravelRequestInput, 'startDate' | 'endDate' | 'destination' | 'purpose'>
>;

export interface TravelRequestListFilters {
  participantProfileId?: string;
  status?: TravelRequestStatus;
  from?: Date;
  to?: Date;
}

const SORTABLE = new Set([
  'startDate',
  'endDate',
  'destination',
  'status',
  'decidedAt',
  'createdAt',
]);

const VIEW_SELECT = {
  id: true,
  participantProfileId: true,
  startDate: true,
  endDate: true,
  destination: true,
  purpose: true,
  status: true,
  decisionNotes: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
} as const;

/** List rows add the same participant summary drug-test rows carry. */
const LIST_SELECT = {
  ...VIEW_SELECT,
  participantProfile: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} as const;

type TravelRequestViewRow = Prisma.TravelRequestGetPayload<{ select: typeof VIEW_SELECT }>;
type TravelRequestListRow = Prisma.TravelRequestGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(row: TravelRequestListRow) {
  const { participantProfile, ...rest } = row;
  return { ...rest, participant: participantProfile };
}

export type TravelRequestView = TravelRequestViewRow;
export type TravelRequestListItem = ReturnType<typeof toListItem>;

@Injectable()
export class TravelRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: TravelRequestListFilters) {
    const where: Prisma.TravelRequestWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to
        ? {
            startDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
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

    const orderBy: Prisma.TravelRequestOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { startDate: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.travelRequest.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.travelRequest.count({ where }),
    ]);

    return { items: rows.map(toListItem), total, page: query.page, pageSize: query.pageSize };
  }

  /** New requests always start pending (Prisma default) — status is never client-set. */
  async create(input: TravelRequestCreateInput, userId: string) {
    await assertParticipant(this.prisma, input.participantProfileId);
    const created = await this.prisma.travelRequest.create({
      data: { ...input, createdById: userId },
      select: VIEW_SELECT,
    });
    await this.audit.logCreate(userId, 'travel_request', created.id, created);
    return created;
  }

  /** Trip details are editable only while the request is still pending. */
  async update(id: string, input: TravelRequestUpdateInput, userId: string) {
    const existing = await this.findRequest(id);
    if (existing.status !== 'pending') {
      throw new BadRequestException('Only pending travel requests can be edited');
    }
    // The schema's end>=start refinement only runs when both dates are in the
    // payload — re-check against the stored dates when just one is changing.
    const start = input.startDate ?? existing.startDate;
    const end = input.endDate ?? existing.endDate;
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('End date cannot be before start date');
    }

    const updated = await this.prisma.travelRequest.update({
      where: { id },
      data: input,
      select: VIEW_SELECT,
    });
    await this.audit.logUpdate(userId, 'travel_request', id, existing, updated);
    return updated;
  }

  /**
   * Approval workflow. Allowed transitions: pending → approved/denied/canceled,
   * and approved → canceled (trip called off after sign-off). Anything else is
   * a 400 — decisions are never edited in place, and denied/canceled are final.
   */
  async decide(id: string, input: TravelDecisionInput, userId: string) {
    const existing = await this.findRequest(id);
    const allowed =
      existing.status === 'pending' ||
      (existing.status === 'approved' && input.status === 'canceled');
    if (!allowed) {
      throw new BadRequestException(
        `A ${existing.status} travel request cannot be marked ${input.status}`,
      );
    }

    const updated = await this.prisma.travelRequest.update({
      where: { id },
      data: {
        status: input.status,
        decisionNotes: input.decisionNotes ?? null,
        decidedById: userId,
        decidedAt: new Date(),
      },
      select: VIEW_SELECT,
    });
    await this.audit.logUpdate(userId, 'travel_request', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, userId: string) {
    const existing = await this.findRequest(id);
    await this.prisma.travelRequest.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.logDelete(userId, 'travel_request', id, existing);
    return { ok: true };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async findRequest(id: string): Promise<TravelRequestViewRow> {
    const request = await this.prisma.travelRequest.findFirst({
      where: { id, deletedAt: null },
      select: VIEW_SELECT,
    });
    if (!request) throw new NotFoundException('Travel request not found');
    return request;
  }
}
