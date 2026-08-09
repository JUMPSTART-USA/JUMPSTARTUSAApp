import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types';

export interface TimelineEvent {
  type:
    | 'inside_enrollment'
    | 'outside_enrollment'
    | 'housing_enrollment'
    | 'case_note'
    | 'case_service'
    | 'employment'
    | 'status_change'
    | 'communication'
    | 'alumni_engagement';
  date: Date;
  title: string;
  detail?: string;
  entityId: string;
  /** Parent entity for navigation (inside class / outside program id). */
  refId?: string;
}

/**
 * The Activity History tab (§6.1 workflow 4): a unioned feed of everything
 * that ever happened to a participant, newest first.
 */
@Injectable()
export class ParticipantTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async timeline(
    id: string,
    query: { page: number; pageSize: number },
    viewer: AuthenticatedUser,
  ) {
    const profile = await this.prisma.participantProfile.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, personId: true, assignedCaseManagerId: true, chapterState: true },
    });
    if (!profile) throw new NotFoundException('Participant not found');
    // Chapter scoping (§7.2): same derivation as the list filter (own chapterState).
    assertChapterAccess(viewer.chapter, profile.chapterState);

    const [
      inside,
      outside,
      housing,
      notes,
      services,
      employments,
      statusHistory,
      communications,
      engagements,
    ] = await this.prisma.$transaction([
      this.prisma.insideClassEnrollment.findMany({
        where: { participantProfileId: id, deletedAt: null },
        include: { insideClass: { select: { name: true } } },
      }),
      this.prisma.outsideProgramEnrollment.findMany({
        where: { participantProfileId: id, deletedAt: null },
        include: { outsideProgram: { select: { name: true } } },
      }),
      this.prisma.housingEnrollment.findMany({
        where: { participantProfileId: id, deletedAt: null },
        include: { home: { select: { name: true } } },
      }),
      this.prisma.caseNote.findMany({ where: { participantProfileId: id, deletedAt: null } }),
      this.prisma.caseService.findMany({ where: { participantProfileId: id, deletedAt: null } }),
      this.prisma.participantEmployment.findMany({
        where: { participantProfileId: id, deletedAt: null },
        include: { employer: { select: { name: true } } },
      }),
      this.prisma.participantStatusHistory.findMany({ where: { participantProfileId: id } }),
      this.prisma.communication.findMany({ where: { personId: profile.personId } }),
      this.prisma.alumniEngagement.findMany({ where: { participantProfileId: id } }),
    ]);

    // §7.3: confidential notes appear as a dated stub — the record's
    // completeness stays visible without the content — unless the viewer is
    // the author, the assigned case manager, or holds the confidential-read
    // permission.
    const canReadAllConfidential =
      viewer.permissions.has('case_notes.confidential.read') ||
      profile.assignedCaseManagerId === viewer.id;
    const revealedConfidentialNoteIds = new Set<string>();

    const events: TimelineEvent[] = [
      ...inside.map((e): TimelineEvent => ({
        type: 'inside_enrollment',
        date: e.enrollmentDate,
        title: `Inside class: ${e.insideClass.name}`,
        detail: e.completionStatus,
        entityId: e.id,
        refId: e.insideClassId,
      })),
      ...outside.map((e): TimelineEvent => ({
        type: 'outside_enrollment',
        date: e.enrollmentDate,
        title: `Outside program: ${e.outsideProgram.name}`,
        detail: e.status,
        entityId: e.id,
        refId: e.outsideProgramId,
      })),
      ...housing.map((h): TimelineEvent => ({
        type: 'housing_enrollment',
        date: h.moveInDate,
        title: `Moved into ${h.home.name}`,
        detail: h.status,
        entityId: h.id,
      })),
      ...notes.map((n): TimelineEvent => {
        const authorized =
          !n.confidential ||
          canReadAllConfidential ||
          n.caseManagerId === viewer.id ||
          n.createdById === viewer.id;
        if (n.confidential && authorized) revealedConfidentialNoteIds.add(n.id);
        return authorized
          ? {
              type: 'case_note',
              date: n.noteDate,
              title: `Case note — ${n.category} (${n.contactType})`,
              detail: n.content,
              entityId: n.id,
            }
          : {
              type: 'case_note',
              date: n.noteDate,
              title: '[Confidential note]',
              entityId: n.id,
            };
      }),
      ...services.map((s): TimelineEvent => ({
        type: 'case_service',
        date: s.serviceDate,
        title: `Service: ${s.serviceType}`,
        detail: s.description ?? undefined,
        entityId: s.id,
      })),
      ...employments.map((e): TimelineEvent => ({
        type: 'employment',
        date: e.startDate ?? e.createdAt,
        title: `${e.jobTitle} at ${e.employer.name}`,
        detail: e.status,
        entityId: e.id,
      })),
      ...statusHistory.map((h): TimelineEvent => ({
        type: 'status_change',
        date: h.effectiveDate,
        title: `Status change — ${h.domain}: ${h.fromValue ?? 'none'} → ${h.toValue}`,
        detail: h.reason ?? undefined,
        entityId: h.id,
      })),
      ...communications.map((c): TimelineEvent => ({
        type: 'communication',
        date: c.sentAt ?? c.createdAt,
        title: c.subject ?? `${c.channel} message`,
        detail: c.status,
        entityId: c.id,
      })),
      ...engagements.map((a): TimelineEvent => ({
        type: 'alumni_engagement',
        date: a.engagementDate,
        title: `Alumni engagement: ${a.engagementType}`,
        detail: a.notes ?? undefined,
        entityId: a.id,
      })),
    ];

    events.sort((a, b) => b.date.getTime() - a.date.getTime());
    const total = events.length;
    const start = (query.page - 1) * query.pageSize;
    const items = events.slice(start, start + query.pageSize);

    // §7.3 — reads of confidential note content are themselves audit-logged
    // (only the notes actually returned on this page).
    for (const e of items) {
      if (e.type === 'case_note' && revealedConfidentialNoteIds.has(e.entityId)) {
        await this.audit.logConfidentialRead(viewer.id, 'case_note', e.entityId);
      }
    }

    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
