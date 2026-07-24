import { Injectable } from '@nestjs/common';
import type { NoteCategory, TaskStatus } from '@jumpstart/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { localTodayStr, personName, todayUtcMidnight, utcDateStr } from './participant.util';

export interface FollowUpItem {
  kind: 'task' | 'note_follow_up';
  id: string;
  title: string;
  dueDate: Date | null;
  participantProfileId: string | null;
  participantName: string | null;
  status?: TaskStatus;
  category?: NoteCategory;
}

const PARTICIPANT_NAME_INCLUDE = {
  participantProfile: {
    select: { person: { select: { firstName: true, lastName: true } } },
  },
} as const;

@Injectable()
export class CaseloadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The case manager's home screen (§6.5): my open tasks + my note follow-ups
   * not yet done, split overdue / today / upcoming.
   */
  async followUps(userId: string) {
    const [tasks, notes] = await this.prisma.$transaction([
      this.prisma.caseTask.findMany({
        where: { deletedAt: null, assignedToId: userId, status: { in: ['open', 'in_progress'] } },
        include: PARTICIPANT_NAME_INCLUDE,
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.caseNote.findMany({
        where: { deletedAt: null, caseManagerId: userId, followUpRequired: true, followUpDoneAt: null },
        include: PARTICIPANT_NAME_INCLUDE,
        orderBy: { followUpDate: 'asc' },
      }),
    ]);

    const items: FollowUpItem[] = [
      ...tasks.map((t): FollowUpItem => ({
        kind: 'task',
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        participantProfileId: t.participantProfileId,
        participantName: personName(t.participantProfile?.person),
        status: t.status,
      })),
      // Note follow-ups here are always the viewer's OWN notes (caseManagerId
      // filter above), so surfacing the category is not a §7.3 leak.
      ...notes.map((n): FollowUpItem => ({
        kind: 'note_follow_up',
        id: n.id,
        title: `Case note follow-up (${n.category})`,
        dueDate: n.followUpDate,
        participantProfileId: n.participantProfileId,
        participantName: personName(n.participantProfile.person),
        category: n.category,
      })),
    ];

    const todayStr = localTodayStr();
    const overdue: FollowUpItem[] = [];
    const today: FollowUpItem[] = [];
    const upcoming: FollowUpItem[] = [];
    for (const item of items) {
      if (!item.dueDate) {
        upcoming.push(item); // undated tasks: visible but never "overdue"
        continue;
      }
      const d = utcDateStr(item.dueDate);
      if (d < todayStr) overdue.push(item);
      else if (d === todayStr) today.push(item);
      else upcoming.push(item);
    }
    const byDate = (a: FollowUpItem, b: FollowUpItem) =>
      (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
    overdue.sort(byDate);
    today.sort(byDate);
    upcoming.sort(byDate);

    return { overdue, today, upcoming };
  }

  /**
   * Supervisor caseload dashboard (§6.5). Counts only — never note content,
   * so it is safe for every case_management.read holder (§7.3).
   */
  async caseloadSummary() {
    const todayUtc = todayUtcMidnight();
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // Promise.all, not $transaction: groupBy loses its result typing in a
    // batch context, and a dashboard snapshot needs no isolation guarantee.
    const [participants, recentNotes, overdueTasks, overdueNoteFollowUps, recentContacts] =
      await Promise.all([
        // "Caseload" = every non-deleted participant with an assigned CM.
        this.prisma.participantProfile.findMany({
          where: { deletedAt: null, assignedCaseManagerId: { not: null } },
          select: { id: true, assignedCaseManagerId: true },
        }),
        this.prisma.caseNote.groupBy({
          by: ['caseManagerId'],
          where: { deletedAt: null, noteDate: { gte: sevenDaysAgo } },
          _count: { _all: true },
          orderBy: { caseManagerId: 'asc' },
        }),
        this.prisma.caseTask.groupBy({
          by: ['assignedToId'],
          where: {
            deletedAt: null,
            status: { in: ['open', 'in_progress'] },
            dueDate: { lt: todayUtc },
          },
          _count: { _all: true },
          orderBy: { assignedToId: 'asc' },
        }),
        this.prisma.caseNote.groupBy({
          by: ['caseManagerId'],
          where: {
            deletedAt: null,
            followUpRequired: true,
            followUpDoneAt: null,
            followUpDate: { lt: todayUtc },
          },
          _count: { _all: true },
          orderBy: { caseManagerId: 'asc' },
        }),
        this.prisma.caseNote.findMany({
          where: { deletedAt: null, noteDate: { gte: thirtyDaysAgo } },
          distinct: ['participantProfileId'],
          select: { participantProfileId: true },
        }),
      ]);

    const caseloads = new Map<string, string[]>(); // cmId -> participant ids
    for (const p of participants) {
      if (!p.assignedCaseManagerId) continue;
      const list = caseloads.get(p.assignedCaseManagerId) ?? [];
      list.push(p.id);
      caseloads.set(p.assignedCaseManagerId, list);
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...caseloads.keys()] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userNames = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    const notes7 = new Map(recentNotes.map((r) => [r.caseManagerId, r._count._all]));
    const overdueTaskCounts = new Map(overdueTasks.map((r) => [r.assignedToId, r._count._all]));
    const overdueNoteCounts = new Map(
      overdueNoteFollowUps.map((r) => [r.caseManagerId, r._count._all]),
    );
    const contacted = new Set(recentContacts.map((r) => r.participantProfileId));

    return [...caseloads.entries()]
      .map(([caseManagerId, participantIds]) => ({
        caseManagerId,
        caseManagerName: userNames.get(caseManagerId) ?? 'Unknown user',
        activeParticipants: participantIds.length,
        notesLast7Days: notes7.get(caseManagerId) ?? 0,
        overdueFollowUps:
          (overdueTaskCounts.get(caseManagerId) ?? 0) + (overdueNoteCounts.get(caseManagerId) ?? 0),
        participantsNoContact30Days: participantIds.filter((id) => !contacted.has(id)).length,
      }))
      .sort((a, b) => a.caseManagerName.localeCompare(b.caseManagerName));
  }
}
