import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  IncidentCategory,
  IncidentReportInput,
  IncidentSeverity,
  IncidentStatus,
  ListQuery,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';
import { assertParticipant } from './participant.util';

export type IncidentReportCreateInput = IncidentReportInput;
export type IncidentReportUpdateInput = Partial<IncidentReportInput>;

export interface IncidentReportListFilters {
  participantProfileId?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  category?: IncidentCategory;
  from?: Date;
  to?: Date;
  state?: string;
}

const SORTABLE = new Set(['incidentDate', 'category', 'severity', 'status', 'createdAt']);

/** Statuses that close an incident — entering one stamps resolvedAt. */
const CLOSED_STATUSES: ReadonlySet<IncidentStatus> = new Set(['resolved', 'dismissed']);

const VIEW_SELECT = {
  id: true,
  participantProfileId: true,
  incidentDate: true,
  category: true,
  severity: true,
  description: true,
  actionTaken: true,
  status: true,
  resolutionNotes: true,
  resolvedAt: true,
  createdAt: true,
} as const;

/** List rows add the same participant summary drug-test rows carry. */
const LIST_SELECT = {
  ...VIEW_SELECT,
  participantProfile: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} as const;

type IncidentReportViewRow = Prisma.IncidentReportGetPayload<{ select: typeof VIEW_SELECT }>;
type IncidentReportListRow = Prisma.IncidentReportGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(row: IncidentReportListRow) {
  const { participantProfile, ...rest } = row;
  return { ...rest, participant: participantProfile };
}

export type IncidentReportView = IncidentReportViewRow;
export type IncidentReportListItem = ReturnType<typeof toListItem>;

@Injectable()
export class IncidentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListQuery, filters: IncidentReportListFilters) {
    const where: Prisma.IncidentReportWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      // Chapter scoping (§7.2): derived through the participant profile. Wrapped
      // in AND so the search's own participantProfile clause cannot replace it.
      ...(filters.state
        ? { AND: [{ participantProfile: { chapterState: filters.state } }] }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.from || filters.to
        ? {
            incidentDate: {
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

    const orderBy: Prisma.IncidentReportOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { incidentDate: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.incidentReport.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.incidentReport.count({ where }),
    ]);

    return { items: rows.map(toListItem), total, page: query.page, pageSize: query.pageSize };
  }

  async create(input: IncidentReportCreateInput, user: AuthenticatedUser) {
    const userId = user.id;
    await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    const created = await this.prisma.incidentReport.create({
      data: {
        ...input,
        // A report filed directly in a closed status is resolved on arrival.
        resolvedAt: CLOSED_STATUSES.has(input.status) ? new Date() : null,
        createdById: userId,
      },
      select: VIEW_SELECT,
    });
    await this.audit.logCreate(userId, 'incident_report', created.id, created);
    return created;
  }

  async update(id: string, input: IncidentReportUpdateInput, user: AuthenticatedUser) {
    const userId = user.id;
    const existing = await this.findReport(id, user.chapter);
    if (input.participantProfileId) {
      await assertParticipant(this.prisma, input.participantProfileId, user.chapter);
    }

    // resolvedAt tracks status: entering resolved/dismissed stamps it (keeping
    // the original stamp if the report was already closed); moving back to
    // open/in_review clears it. Untouched when status is absent from the patch.
    const resolvedAtPatch = input.status
      ? CLOSED_STATUSES.has(input.status)
        ? { resolvedAt: existing.resolvedAt ?? new Date() }
        : { resolvedAt: null }
      : {};

    const updated = await this.prisma.incidentReport.update({
      where: { id },
      data: { ...input, ...resolvedAtPatch },
      select: VIEW_SELECT,
    });
    await this.audit.logUpdate(userId, 'incident_report', id, existing, updated);
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const existing = await this.findReport(id, user.chapter);
    await this.prisma.incidentReport.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.logDelete(user.id, 'incident_report', id, existing);
    return { ok: true };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Fetch-for-mutation with the chapter guard (§7.2) applied once. */
  private async findReport(id: string, userChapter: string | null): Promise<IncidentReportViewRow> {
    const report = await this.prisma.incidentReport.findFirst({
      where: { id, deletedAt: null },
      select: { ...VIEW_SELECT, participantProfile: { select: { chapterState: true } } },
    });
    if (!report) throw new NotFoundException('Incident report not found');
    assertChapterAccess(userChapter, report.participantProfile.chapterState);
    const { participantProfile: _participantProfile, ...reportOnly } = report;
    return reportOnly;
  }
}
