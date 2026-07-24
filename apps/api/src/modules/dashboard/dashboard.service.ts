import { Injectable } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import {
  INSIDE_STATUSES,
  OUTSIDE_STATUSES,
  type InsideStatus,
  type OutsideStatus,
  type ProgramType,
} from '@jumpstart/shared';
import { hasPerm, type AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';

export interface DashboardFilters {
  from?: Date;
  to?: Date;
  state?: string;
  institutionId?: string;
  programType?: ProgramType;
  participantStatus?: string;
}

/** §6.13: all alerts share one "attention needed" shape. */
export interface AttentionItem {
  key: string;
  label: string;
  count: number;
}

// §6.13: dashboard reads are cached ~5 minutes. The key includes the user's
// sorted permission set because permissions decide which widgets are computed.
const CACHE_TTL_MS = 5 * 60_000;

const DAY_MS = 86_400_000;
const addDays = (base: Date, days: number) => new Date(base.getTime() + days * DAY_MS);
/** Midnight UTC — matches how @db.Date columns store values. */
const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

@Injectable()
export class DashboardService {
  private readonly cache = new Map<string, { expiresAt: number; payload: unknown }>();

  constructor(private readonly prisma: PrismaService) {}

  async overview(filters: DashboardFilters, user: AuthenticatedUser) {
    const key = this.cacheKey(filters, user);
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.payload;

    const payload = await this.build(filters, user);
    for (const [k, v] of this.cache) if (v.expiresAt <= Date.now()) this.cache.delete(k);
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return payload;
  }

  private cacheKey(filters: DashboardFilters, user: AuthenticatedUser): string {
    const f = [
      filters.from?.toISOString() ?? '',
      filters.to?.toISOString() ?? '',
      filters.state ?? '',
      filters.institutionId ?? '',
      filters.programType ?? '',
      filters.participantStatus ?? '',
    ].join('|');
    return `${f}#${[...user.permissions].sort().join(',')}`;
  }

  /**
   * Widget × filter applicability (§6.13). Filters apply only where the data
   * carries the dimension:
   *  - from/to: completedPrograms/leftEarly (outcome dates) and donorCount/
   *    donationTotal (donationDate). Ignored by all "right now" stock counts,
   *    by upcomingEvents (fixed next-60-days window) and by recentCaseActivity
   *    (fixed last-7-days window).
   *  - state: activeInsideClasses (institution.state), activeOutsidePrograms
   *    (program.state), participantsInHousing (home.state) and the
   *    completed/left-early outcomes. Ignored by person-level and org-wide
   *    widgets (participants, volunteers, donors, campaigns, events,
   *    employers, vehicles, case activity, intake queues).
   *  - institutionId: inside-class widgets only.
   *  - programType: outside-program widgets only.
   *  - participantStatus: activeParticipants only (overrides its default
   *    "active" definition).
   *
   * Each widget is included only when the user holds that module's read
   * permission — the SPA hides what is absent.
   */
  private async build(filters: DashboardFilters, user: AuthenticatedUser) {
    const now = new Date();
    const todayUtc = startOfUtcDay(now);
    const range =
      filters.from || filters.to
        ? { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) }
        : undefined;

    const data: Record<string, unknown> = {};
    let vehicleAlertCount = 0;
    let clearanceExpirations = 0;
    let overdueFollowUps = 0;
    let intakeSlaBreaches = 0;

    const tasks: Promise<void>[] = [];

    if (hasPerm(user, 'inside_classes.read')) {
      tasks.push(
        (async () => {
          data.activeInsideClasses = await this.prisma.insideClass.count({
            where: {
              deletedAt: null,
              status: 'active',
              ...(filters.institutionId ? { institutionId: filters.institutionId } : {}),
              ...(filters.state ? { institution: { state: filters.state } } : {}),
            },
          });
        })(),
      );
    }

    if (hasPerm(user, 'outside_programs.read')) {
      tasks.push(
        (async () => {
          data.activeOutsidePrograms = await this.prisma.outsideProgram.count({
            where: {
              deletedAt: null,
              status: 'active',
              ...(filters.programType ? { programType: filters.programType } : {}),
              ...(filters.state ? { state: filters.state } : {}),
            },
          });
        })(),
      );
    }

    if (hasPerm(user, 'participants.read')) {
      tasks.push(
        (async () => {
          data.activeParticipants = await this.prisma.participantProfile.count({
            where: { deletedAt: null, ...this.participantScope(filters.participantStatus) },
          });
        })(),
      );
    }

    if (hasPerm(user, 'housing.read')) {
      tasks.push(
        (async () => {
          data.participantsInHousing = await this.prisma.housingEnrollment.count({
            where: {
              deletedAt: null,
              status: 'active',
              ...(filters.state ? { home: { state: filters.state } } : {}),
            },
          });
        })(),
      );
    }

    // Period outcomes span both program domains; each half is counted only
    // when the user can read that domain.
    const canInside = hasPerm(user, 'inside_classes.read');
    const canOutside = hasPerm(user, 'outside_programs.read');
    if (canInside || canOutside) {
      tasks.push(
        (async () => {
          let completed = 0;
          let leftEarly = 0;
          if (canInside) {
            const classScope: Prisma.InsideClassWhereInput = {
              ...(filters.institutionId ? { institutionId: filters.institutionId } : {}),
              ...(filters.state ? { institution: { state: filters.state } } : {}),
            };
            const scoped = Object.keys(classScope).length ? { insideClass: classScope } : {};
            const [c, l] = await Promise.all([
              this.prisma.insideClassEnrollment.count({
                where: {
                  deletedAt: null,
                  completionStatus: 'completed',
                  ...(range ? { completionDate: range } : {}),
                  ...scoped,
                },
              }),
              this.prisma.insideClassEnrollment.count({
                where: {
                  deletedAt: null,
                  completionStatus: 'left_early',
                  ...(range ? { leftEarlyDate: range } : {}),
                  ...scoped,
                },
              }),
            ]);
            completed += c;
            leftEarly += l;
          }
          if (canOutside) {
            const programScope: Prisma.OutsideProgramWhereInput = {
              ...(filters.programType ? { programType: filters.programType } : {}),
              ...(filters.state ? { state: filters.state } : {}),
            };
            const scoped = Object.keys(programScope).length ? { outsideProgram: programScope } : {};
            const [c, l] = await Promise.all([
              this.prisma.outsideProgramEnrollment.count({
                where: {
                  deletedAt: null,
                  status: 'completed',
                  ...(range ? { completionDate: range } : {}),
                  ...scoped,
                },
              }),
              this.prisma.outsideProgramEnrollment.count({
                where: {
                  deletedAt: null,
                  status: 'left_early',
                  ...(range ? { leftEarlyDate: range } : {}),
                  ...scoped,
                },
              }),
            ]);
            completed += c;
            leftEarly += l;
          }
          data.completedPrograms = completed;
          data.leftEarly = leftEarly;
        })(),
      );
    }

    if (hasPerm(user, 'volunteers.read')) {
      tasks.push(
        (async () => {
          const soon = addDays(todayUtc, 30);
          const [active, expiring] = await Promise.all([
            this.prisma.volunteerProfile.count({ where: { deletedAt: null, status: 'active' } }),
            // Includes already-expired clearances still marked satisfied —
            // those are the most urgent items on the list.
            this.prisma.volunteerClearance.count({
              where: { status: 'satisfied', expiresAt: { lte: soon } },
            }),
          ]);
          data.volunteersActive = active;
          clearanceExpirations = expiring;
        })(),
      );
    }

    if (hasPerm(user, 'donors.read')) {
      tasks.push(
        (async () => {
          const donationWhere: Prisma.DonationWhereInput = {
            deletedAt: null,
            ...(range ? { donationDate: range } : {}),
          };
          const [sum, donorCount, lastSync] = await Promise.all([
            this.prisma.donation.aggregate({ where: donationWhere, _sum: { amount: true } }),
            // With a period: distinct donors who gave in it; without: all donors.
            range
              ? this.prisma.donation
                  .findMany({ where: donationWhere, distinct: ['donorId'], select: { donorId: true } })
                  .then((rows) => rows.length)
              : this.prisma.donor.count({ where: { deletedAt: null } }),
            this.prisma.syncRun.findFirst({
              where: { target: 'bloomerang', status: 'success' },
              orderBy: { startedAt: 'desc' },
              select: { finishedAt: true },
            }),
          ]);
          data.donorCount = donorCount;
          data.donationTotal = sum._sum.amount ? Number(sum._sum.amount) : 0;
          // §6.8: donors/donations are a Bloomerang mirror — surface staleness.
          data.donationsLastSyncedAt = lastSync?.finishedAt ?? null;
        })(),
      );
    }

    if (hasPerm(user, 'campaigns.read')) {
      tasks.push(
        (async () => {
          const campaigns = await this.prisma.campaign.findMany({
            where: { deletedAt: null, status: 'active' },
            select: { id: true, name: true, goalAmount: true, startDate: true, endDate: true },
            orderBy: { name: 'asc' },
          });
          // Raised-to-date is computed from mirrored donations (§6.8) — it is
          // deliberately NOT period-filtered ("to date").
          const sums = campaigns.length
            ? await this.prisma.donation.groupBy({
                by: ['campaignId'],
                where: { deletedAt: null, campaignId: { in: campaigns.map((c) => c.id) } },
                _sum: { amount: true },
              })
            : [];
          const raised = new Map(
            sums.map((s) => [s.campaignId, s._sum.amount ? Number(s._sum.amount) : 0]),
          );
          data.activeCampaigns = campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            goalAmount: c.goalAmount ? Number(c.goalAmount) : null,
            raisedToDate: raised.get(c.id) ?? 0,
            startDate: c.startDate,
            endDate: c.endDate,
          }));
        })(),
      );
    }

    if (hasPerm(user, 'events.read')) {
      tasks.push(
        (async () => {
          data.upcomingEvents = await this.prisma.event.findMany({
            where: { deletedAt: null, eventDate: { gte: todayUtc, lte: addDays(todayUtc, 60) } },
            select: { id: true, name: true, eventType: true, eventDate: true, location: true },
            orderBy: { eventDate: 'asc' },
          });
        })(),
      );
    }

    if (hasPerm(user, 'employers.read')) {
      tasks.push(
        (async () => {
          data.activeEmployers = await this.prisma.employer.count({
            where: { deletedAt: null, hiringStatus: { in: ['partner', 'actively_hiring'] } },
          });
        })(),
      );
    }

    if (hasPerm(user, 'employment.read')) {
      tasks.push(
        (async () => {
          const rows = await this.prisma.participantEmployment.findMany({
            where: { deletedAt: null, status: 'active' },
            distinct: ['participantProfileId'],
            select: { participantProfileId: true },
          });
          data.employedParticipants = rows.length;
        })(),
      );
    }

    if (hasPerm(user, 'vehicles.read')) {
      tasks.push(
        (async () => {
          const soon = addDays(todayUtc, 30);
          const [active, latestMaintenance, registrationDue, insuranceDue] = await Promise.all([
            this.prisma.vehicle.count({ where: { deletedAt: null, active: true } }),
            // Latest record per vehicle decides what is due — older records
            // are superseded by later service.
            this.prisma.vehicleMaintenanceRecord.findMany({
              where: { deletedAt: null, vehicle: { deletedAt: null, active: true } },
              orderBy: { maintenanceDate: 'desc' },
              distinct: ['vehicleId'],
              select: { nextServiceDueDate: true },
            }),
            this.prisma.vehicle.count({
              where: { deletedAt: null, active: true, registrationExpiration: { lte: soon } },
            }),
            this.prisma.vehicle.count({
              where: { deletedAt: null, active: true, insuranceExpiration: { lte: soon } },
            }),
          ]);
          const maintenanceDue = latestMaintenance.filter(
            (r) => r.nextServiceDueDate !== null && r.nextServiceDueDate <= soon,
          ).length;
          data.vehiclesActive = active;
          vehicleAlertCount = maintenanceDue + registrationDue + insuranceDue;
          data.vehicleAlerts = vehicleAlertCount;
        })(),
      );
    }

    if (hasPerm(user, 'case_management.read')) {
      tasks.push(
        (async () => {
          const weekAgo = addDays(now, -7);
          // §7.3: counts only — the dashboard never surfaces note content.
          const [notes, services, overdue] = await Promise.all([
            this.prisma.caseNote.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
            this.prisma.caseService.count({
              where: { deletedAt: null, createdAt: { gte: weekAgo } },
            }),
            this.prisma.caseNote.count({
              where: {
                deletedAt: null,
                followUpRequired: true,
                followUpDoneAt: null,
                followUpDate: { lt: todayUtc },
              },
            }),
          ]);
          data.recentCaseActivity = { notes, services, total: notes + services };
          overdueFollowUps = overdue;
        })(),
      );
    }

    if (hasPerm(user, 'intake_queues.read')) {
      tasks.push(
        (async () => {
          // §6.11: queue COUNTS only — referral content itself sits behind the
          // tighter referral_inbox.read permission, never on the dashboard.
          const slaCutoff = addDays(now, -3);
          const [volPending, refPending, oldestVol, oldestRef, volBreaches, refBreaches] =
            await Promise.all([
              this.prisma.volunteerApplication.count({ where: { status: 'pending' } }),
              this.prisma.referralInboxItem.count({ where: { status: 'pending' } }),
              this.prisma.volunteerApplication.findFirst({
                where: { status: 'pending' },
                orderBy: { submittedAt: 'asc' },
                select: { submittedAt: true },
              }),
              this.prisma.referralInboxItem.findFirst({
                where: { status: 'pending' },
                orderBy: { submittedAt: 'asc' },
                select: { submittedAt: true },
              }),
              this.prisma.volunteerApplication.count({
                where: { status: 'pending', submittedAt: { lt: slaCutoff } },
              }),
              this.prisma.referralInboxItem.count({
                where: { status: 'pending', submittedAt: { lt: slaCutoff } },
              }),
            ]);
          const oldest = [oldestVol?.submittedAt, oldestRef?.submittedAt].filter(
            (d): d is Date => d instanceof Date,
          );
          data.intakeQueues = {
            volunteerApplicationsPending: volPending,
            referralsPending: refPending,
            oldestPendingDays: oldest.length
              ? Math.floor((now.getTime() - Math.min(...oldest.map((d) => d.getTime()))) / DAY_MS)
              : null,
          };
          intakeSlaBreaches = volBreaches + refBreaches;
        })(),
      );
    }

    await Promise.all(tasks);

    // §6.13: one "attention needed" pattern for every alert source. Only the
    // sources the user's permissions allowed are ever counted above.
    const attentionNeeded: AttentionItem[] = [];
    if (vehicleAlertCount > 0) {
      attentionNeeded.push({
        key: 'vehicle_alerts',
        label: 'Vehicles with maintenance, registration, or insurance due within 30 days',
        count: vehicleAlertCount,
      });
    }
    if (clearanceExpirations > 0) {
      attentionNeeded.push({
        key: 'clearance_expirations',
        label: 'Volunteer clearances expiring within 30 days',
        count: clearanceExpirations,
      });
    }
    if (overdueFollowUps > 0) {
      attentionNeeded.push({
        key: 'overdue_follow_ups',
        label: 'Case-note follow-ups past due',
        count: overdueFollowUps,
      });
    }
    if (intakeSlaBreaches > 0) {
      attentionNeeded.push({
        key: 'intake_sla_breaches',
        label: 'Intake submissions pending more than 3 days',
        count: intakeSlaBreaches,
      });
    }
    data.attentionNeeded = attentionNeeded;

    return { generatedAt: now, filters, ...data };
  }

  /**
   * Default "active participant" definition: outsideStatus active OR
   * insideStatus active/enrolled. A participantStatus filter replaces it,
   * matching whichever domain(s) define that value (they overlap).
   */
  private participantScope(participantStatus?: string): Prisma.ParticipantProfileWhereInput {
    if (!participantStatus) {
      return {
        OR: [{ outsideStatus: 'active' }, { insideStatus: { in: ['active', 'enrolled'] } }],
      };
    }
    const or: Prisma.ParticipantProfileWhereInput[] = [];
    if ((INSIDE_STATUSES as readonly string[]).includes(participantStatus)) {
      or.push({ insideStatus: participantStatus as InsideStatus });
    }
    if ((OUTSIDE_STATUSES as readonly string[]).includes(participantStatus)) {
      or.push({ outsideStatus: participantStatus as OutsideStatus });
    }
    return { OR: or };
  }
}
