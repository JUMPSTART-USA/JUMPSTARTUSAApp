import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ListQuery, TransportDecisionInput, TransportRequestStatus } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { PARTICIPANT_SUMMARY_SELECT, participantSearch } from './portal.util';

export interface TransportRequestListFilters {
  participantProfileId?: string;
  status?: TransportRequestStatus;
  from?: Date;
  to?: Date;
  state?: string;
}

const SORTABLE = new Set(['tripDate', 'destination', 'status', 'decidedAt', 'createdAt']);

const VIEW_SELECT = {
  id: true,
  participantProfileId: true,
  tripDate: true,
  tripTime: true,
  destination: true,
  purpose: true,
  returnTripRequested: true,
  returnDate: true,
  returnTime: true,
  returnDestination: true,
  status: true,
  assignedVehicleId: true,
  decisionNotes: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
} as const;

/**
 * List rows add the same participant summary drug-test rows carry, plus a
 * small vehicle summary so the queue can show the assignment without a
 * second fetch.
 */
const LIST_SELECT = {
  ...VIEW_SELECT,
  participantProfile: PARTICIPANT_SUMMARY_SELECT,
  assignedVehicle: { select: { make: true, model: true, licensePlate: true } },
} as const;

type TransportRequestViewRow = Prisma.TransportRequestGetPayload<{ select: typeof VIEW_SELECT }>;
type TransportRequestListRow = Prisma.TransportRequestGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(row: TransportRequestListRow) {
  const { participantProfile, assignedVehicle, ...rest } = row;
  return { ...rest, participant: participantProfile, vehicle: assignedVehicle };
}

export type TransportRequestView = TransportRequestViewRow;
export type TransportRequestListItem = ReturnType<typeof toListItem>;

/**
 * Staff queue for portal transport requests. Rows are created ONLY by the
 * public portal endpoint; staff act on them through the decision workflow.
 */
@Injectable()
export class TransportRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: TransportRequestListFilters) {
    const where: Prisma.TransportRequestWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      // Chapter scoping (§7.2): derived through the participant profile. Wrapped
      // in AND so participantSearch's own participantProfile clause (spread
      // below) cannot replace it.
      ...(filters.state
        ? { AND: [{ participantProfile: { chapterState: filters.state } }] }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to
        ? {
            tripDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(query.search ? participantSearch(query.search) : {}),
    };

    const orderBy: Prisma.TransportRequestOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transportRequest.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.transportRequest.count({ where }),
    ]);

    return { items: rows.map(toListItem), total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Decision workflow (mirrors travel requests). Allowed transitions:
   * pending → approved/denied/canceled, approved → canceled/completed.
   * A vehicle may be assigned only when approving, and must be a live
   * vehicle row. Anything else is a 400; decisions are never edited in place.
   */
  async decide(id: string, input: TransportDecisionInput, user: AuthenticatedUser) {
    const userId = user.id;
    if (input.status === 'pending') {
      throw new BadRequestException('Pending is not a decision');
    }
    const existing = await this.findRequest(id, user.chapter);
    const allowed =
      existing.status === 'pending'
        ? input.status === 'approved' || input.status === 'denied' || input.status === 'canceled'
        : existing.status === 'approved' &&
          (input.status === 'canceled' || input.status === 'completed');
    if (!allowed) {
      throw new BadRequestException(
        `A ${existing.status} transport request cannot be marked ${input.status}`,
      );
    }

    if (input.assignedVehicleId) {
      if (input.status !== 'approved') {
        throw new BadRequestException('A vehicle can only be assigned when approving the request');
      }
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.assignedVehicleId, deletedAt: null },
        select: { id: true, chapterState: true },
      });
      if (!vehicle) throw new BadRequestException('Unknown vehicle');
      // Chapter scoping (§7.2): a scoped user can only assign a vehicle from
      // their own chapter (assigning also reads the plate back on the request).
      assertChapterAccess(user.chapter, vehicle.chapterState);
    }

    const updated = await this.prisma.transportRequest.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.status === 'approved'
          ? { assignedVehicleId: input.assignedVehicleId ?? null }
          : {}),
        decisionNotes: input.decisionNotes ?? null,
        decidedById: userId,
        decidedAt: new Date(),
      },
      select: VIEW_SELECT,
    });
    await this.audit.logUpdate(userId, 'transport_request', id, existing, updated);
    return updated;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Fetch-for-mutation with the chapter guard (§7.2) applied once. */
  private async findRequest(
    id: string,
    userChapter: string | null,
  ): Promise<TransportRequestViewRow> {
    const request = await this.prisma.transportRequest.findFirst({
      where: { id, deletedAt: null },
      select: { ...VIEW_SELECT, participantProfile: { select: { chapterState: true } } },
    });
    if (!request) throw new NotFoundException('Transport request not found');
    assertChapterAccess(userChapter, request.participantProfile.chapterState);
    const { participantProfile: _participantProfile, ...requestOnly } = request;
    return requestOnly;
  }
}
