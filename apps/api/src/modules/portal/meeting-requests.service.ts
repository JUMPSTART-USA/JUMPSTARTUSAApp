import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ListQuery, MeetingDecisionInput, MeetingRequestStatus } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PARTICIPANT_SUMMARY_SELECT, participantSearch } from './portal.util';

export interface MeetingRequestListFilters {
  participantProfileId?: string;
  status?: MeetingRequestStatus;
}

const SORTABLE = new Set(['preferredDate', 'status', 'scheduledFor', 'decidedAt', 'createdAt']);

const VIEW_SELECT = {
  id: true,
  participantProfileId: true,
  preferredDate: true,
  preferredTime: true,
  reason: true,
  status: true,
  scheduledFor: true,
  decisionNotes: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
} as const;

/** List rows add the same participant summary drug-test rows carry. */
const LIST_SELECT = {
  ...VIEW_SELECT,
  participantProfile: PARTICIPANT_SUMMARY_SELECT,
} as const;

type MeetingRequestViewRow = Prisma.MeetingRequestGetPayload<{ select: typeof VIEW_SELECT }>;
type MeetingRequestListRow = Prisma.MeetingRequestGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(row: MeetingRequestListRow) {
  const { participantProfile, ...rest } = row;
  return { ...rest, participant: participantProfile };
}

export type MeetingRequestView = MeetingRequestViewRow;
export type MeetingRequestListItem = ReturnType<typeof toListItem>;

/**
 * Staff queue for portal meeting requests. Rows are created ONLY by the
 * public portal endpoint; staff act on them through the decision workflow.
 */
@Injectable()
export class MeetingRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: MeetingRequestListFilters) {
    const where: Prisma.MeetingRequestWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(query.search ? participantSearch(query.search) : {}),
    };

    const orderBy: Prisma.MeetingRequestOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.meetingRequest.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.meetingRequest.count({ where }),
    ]);

    return { items: rows.map(toListItem), total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Decision workflow (mirrors travel requests). Allowed transitions:
   * pending → scheduled/declined/canceled, and scheduled → canceled (meeting
   * called off after booking — scheduledFor is kept as history). 'scheduled'
   * REQUIRES scheduledFor. Anything else is a 400; decisions are never edited
   * in place.
   */
  async decide(id: string, input: MeetingDecisionInput, userId: string) {
    if (input.status === 'pending') {
      throw new BadRequestException('Pending is not a decision');
    }
    const existing = await this.findRequest(id);
    const allowed =
      existing.status === 'pending' ||
      (existing.status === 'scheduled' && input.status === 'canceled');
    if (!allowed) {
      throw new BadRequestException(
        `A ${existing.status} meeting request cannot be marked ${input.status}`,
      );
    }
    if (input.status === 'scheduled' && !input.scheduledFor) {
      throw new BadRequestException('A scheduled date/time is required to schedule a meeting');
    }

    const updated = await this.prisma.meetingRequest.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.status === 'scheduled' ? { scheduledFor: input.scheduledFor } : {}),
        decisionNotes: input.decisionNotes ?? null,
        decidedById: userId,
        decidedAt: new Date(),
      },
      select: VIEW_SELECT,
    });
    await this.audit.logUpdate(userId, 'meeting_request', id, existing, updated);
    return updated;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async findRequest(id: string): Promise<MeetingRequestViewRow> {
    const request = await this.prisma.meetingRequest.findFirst({
      where: { id, deletedAt: null },
      select: VIEW_SELECT,
    });
    if (!request) throw new NotFoundException('Meeting request not found');
    return request;
  }
}
