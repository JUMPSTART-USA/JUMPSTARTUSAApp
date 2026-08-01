import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { ListQuery, PortalMessageStatus } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PARTICIPANT_SUMMARY_SELECT, participantSearch } from './portal.util';

export interface PortalMessageReviewInput {
  status: PortalMessageStatus;
  staffNotes?: string;
}

export interface PortalMessageListFilters {
  participantProfileId?: string;
  status?: PortalMessageStatus;
}

const SORTABLE = new Set(['createdAt', 'status', 'subject', 'reviewedAt']);

const VIEW_SELECT = {
  id: true,
  participantProfileId: true,
  subject: true,
  body: true,
  status: true,
  staffNotes: true,
  reviewedById: true,
  reviewedAt: true,
  createdAt: true,
} as const;

/** List rows add the same participant summary drug-test rows carry. */
const LIST_SELECT = {
  ...VIEW_SELECT,
  participantProfile: PARTICIPANT_SUMMARY_SELECT,
} as const;

type PortalMessageViewRow = Prisma.PortalMessageGetPayload<{ select: typeof VIEW_SELECT }>;
type PortalMessageListRow = Prisma.PortalMessageGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(row: PortalMessageListRow) {
  const { participantProfile, ...rest } = row;
  return { ...rest, participant: participantProfile };
}

export type PortalMessageView = PortalMessageViewRow;
export type PortalMessageListItem = ReturnType<typeof toListItem>;

/**
 * Staff review queue for participant portal messages. Rows are created ONLY
 * by the public portal endpoint — staff never create or edit message content,
 * they move status (new → read → responded) and attach internal notes.
 */
@Injectable()
export class PortalMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: PortalMessageListFilters) {
    const where: Prisma.PortalMessageWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(query.search ? participantSearch(query.search) : {}),
    };

    const orderBy: Prisma.PortalMessageOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { createdAt: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.portalMessage.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.portalMessage.count({ where }),
    ]);

    return { items: rows.map(toListItem), total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Status/notes update. The first move OFF 'new' stamps reviewedById/At —
   * later status changes keep the original reviewer (an audit row records
   * every subsequent touch). Omitted staffNotes = unchanged.
   */
  async review(id: string, input: PortalMessageReviewInput, userId: string) {
    const existing = await this.findMessage(id);
    const stampReview = input.status !== 'new' && !existing.reviewedAt;

    const updated = await this.prisma.portalMessage.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.staffNotes !== undefined ? { staffNotes: input.staffNotes } : {}),
        ...(stampReview ? { reviewedById: userId, reviewedAt: new Date() } : {}),
      },
      select: VIEW_SELECT,
    });
    await this.audit.logUpdate(userId, 'portal_message', id, existing, updated);
    return updated;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async findMessage(id: string): Promise<PortalMessageViewRow> {
    const message = await this.prisma.portalMessage.findFirst({
      where: { id, deletedAt: null },
      select: VIEW_SELECT,
    });
    if (!message) throw new NotFoundException('Portal message not found');
    return message;
  }
}
