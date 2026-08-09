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
    // Chapter scoping (§7.2): the controller already folds user.chapter into
    // filters.state, but the chapter is appended defensively so a future
    // widget reading user.chapter directly can never poison the shared cache.
    return `${f}#${user.chapter ?? ''}#${[...user.permissions].sort().join(',')}`;
  }

  /**
   * Widget × filter applicability (§6.13). Filters apply only where the data
   * carries the dimension:
   *  - from/to: completedPrograms/leftEarly (outcome dates) and donorCount/
   *    donationTotal (donationDate). Ignored by all "right now" stock counts,
   *    by upcomingEvents (fixed next-60-days window) and by recentCaseActivity
   *    (fixed last-7-days window).
   *  - state: applies to EVERY widget (§7.2 — the controller forces
   *    user.chapter for chapter-scoped users). Each query filters on the
   *    record's own chapter column (outsideProgram/opportunity/intake-queue
   *    state; participantProfile/volunteerProfile/donor/campaign/event/
   *    employer/vehicle chapterState) or derives it through the owning
   *    parent (institution.state, home.state, volunteerProfile.chapterState,
   *    donor.chapterState, participantProfile.chapterState, vehicle
   *    chapterState). Intake-queue rows with a legacy null state are visible
   *    to all-chapters users only.
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
    let portalRequestsPending = 0;
    let unacknowledgedDonations = 0;
    let pendingTimesheets = 0;

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
          // Chapter scoping (§7.2): participant chapter is the profile's own
          // chapterState — Person.state is a mailing address, not a chapter.
          data.activeParticipants = await this.prisma.participantProfile.count({
            where: {
              deletedAt: null,
              ...(filters.state ? { chapterState: filters.state } : {}),
              ...this.participantScope(filters.participantStatus),
            },
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
          const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          const nextMonthStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
          );
          // Chapter scoping (§7.2): volunteer children derive their chapter
          // via volunteerProfile.chapterState; shifts via opportunity.state.
          const [active, expiring, hoursMonth, pendingHours, upcomingShifts] = await Promise.all([
            this.prisma.volunteerProfile.count({
              where: {
                deletedAt: null,
                status: 'active',
                ...(filters.state ? { chapterState: filters.state } : {}),
              },
            }),
            // Includes already-expired clearances still marked satisfied —
            // those are the most urgent items on the list.
            this.prisma.volunteerClearance.count({
              where: {
                status: 'satisfied',
                expiresAt: { lte: soon },
                ...(filters.state ? { volunteerProfile: { chapterState: filters.state } } : {}),
              },
            }),
            // Approved service hours logged for the current calendar month.
            this.prisma.volunteerHoursEntry.aggregate({
              where: {
                deletedAt: null,
                status: 'approved',
                activityDate: { gte: monthStart, lt: nextMonthStart },
                ...(filters.state ? { volunteerProfile: { chapterState: filters.state } } : {}),
              },
              _sum: { hours: true },
            }),
            this.prisma.volunteerHoursEntry.count({
              where: {
                deletedAt: null,
                status: 'pending',
                ...(filters.state ? { volunteerProfile: { chapterState: filters.state } } : {}),
              },
            }),
            this.prisma.volunteerShift.count({
              where: {
                deletedAt: null,
                shiftDate: { gte: todayUtc, lte: addDays(todayUtc, 7) },
                ...(filters.state ? { opportunity: { state: filters.state } } : {}),
              },
            }),
          ]);
          data.volunteersActive = active;
          clearanceExpirations = expiring;
          data.volunteerHoursMonth = hoursMonth._sum.hours ? Number(hoursMonth._sum.hours) : 0;
          data.pendingTimesheets = pendingHours;
          pendingTimesheets = pendingHours;
          data.upcomingShifts7 = upcomingShifts;
        })(),
      );
    }

    if (hasPerm(user, 'donors.read')) {
      tasks.push(
        (async () => {
          // Chapter scoping (§7.2): CRM children derive via donor.chapterState.
          const donorScope = filters.state ? { donor: { chapterState: filters.state } } : {};
          const donationWhere: Prisma.DonationWhereInput = {
            deletedAt: null,
            ...(range ? { donationDate: range } : {}),
            ...donorScope,
          };
          const [sum, donorCount, activePledges, recurringActive, unacknowledged] =
            await Promise.all([
              this.prisma.donation.aggregate({ where: donationWhere, _sum: { amount: true } }),
              // With a period: distinct donors who gave in it; without: all donors.
              range
                ? this.prisma.donation
                    .findMany({ where: donationWhere, distinct: ['donorId'], select: { donorId: true } })
                    .then((rows) => rows.length)
                : this.prisma.donor.count({
                    where: {
                      deletedAt: null,
                      ...(filters.state ? { chapterState: filters.state } : {}),
                    },
                  }),
              this.prisma.pledge.findMany({
                where: { deletedAt: null, status: 'active', ...donorScope },
                select: { id: true, totalAmount: true, writtenOffAmount: true },
              }),
              this.prisma.recurringGift.count({
                where: { deletedAt: null, status: 'active', ...donorScope },
              }),
              this.prisma.donation.count({
                where: { deletedAt: null, acknowledgedAt: null, ...donorScope },
              }),
            ]);
          data.donorCount = donorCount;
          data.donationTotal = sum._sum.amount ? Number(sum._sum.amount) : 0;

          // Outstanding = total − written-off − paid, per active pledge —
          // computed from payments, never stored (§6.8).
          const paidRows = activePledges.length
            ? await this.prisma.donation.groupBy({
                by: ['pledgeId'],
                where: { deletedAt: null, pledgeId: { in: activePledges.map((p) => p.id) } },
                _sum: { amount: true },
              })
            : [];
          const paidByPledge = new Map(
            paidRows.map((r) => [r.pledgeId, r._sum.amount ? Number(r._sum.amount) : 0]),
          );
          const outstanding = activePledges.reduce((total, p) => {
            const remaining =
              Number(p.totalAmount) -
              Number(p.writtenOffAmount ?? 0) -
              (paidByPledge.get(p.id) ?? 0);
            return total + Math.max(0, remaining);
          }, 0);
          data.pledgesActive = {
            count: activePledges.length,
            outstanding: Math.round(outstanding * 100) / 100,
          };
          data.recurringActive = recurringActive;
          data.unacknowledgedDonations = unacknowledged;
          unacknowledgedDonations = unacknowledged;
        })(),
      );
    }

    if (hasPerm(user, 'campaigns.read')) {
      tasks.push(
        (async () => {
          // Chapter scoping (§7.2): campaigns carry their own chapterState;
          // the raised-to-date groupBy is keyed to the filtered id list.
          const campaigns = await this.prisma.campaign.findMany({
            where: {
              deletedAt: null,
              status: 'active',
              ...(filters.state ? { chapterState: filters.state } : {}),
            },
            select: { id: true, name: true, goalAmount: true, startDate: true, endDate: true },
            orderBy: { name: 'asc' },
          });
          // Raised-to-date is computed from donations (§6.8) — it is
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
          // Chapter scoping (§7.2): events carry their own chapterState.
          data.upcomingEvents = await this.prisma.event.findMany({
            where: {
              deletedAt: null,
              eventDate: { gte: todayUtc, lte: addDays(todayUtc, 60) },
              ...(filters.state ? { chapterState: filters.state } : {}),
            },
            select: { id: true, name: true, eventType: true, eventDate: true, location: true },
            orderBy: { eventDate: 'asc' },
          });
        })(),
      );
    }

    if (hasPerm(user, 'employers.read')) {
      tasks.push(
        (async () => {
          // Chapter scoping (§7.2): employers carry their own chapterState
          // (Employer.state is a postal address).
          data.activeEmployers = await this.prisma.employer.count({
            where: {
              deletedAt: null,
              hiringStatus: { in: ['partner', 'actively_hiring'] },
              ...(filters.state ? { chapterState: filters.state } : {}),
            },
          });
        })(),
      );
    }

    if (hasPerm(user, 'employment.read')) {
      tasks.push(
        (async () => {
          // Chapter scoping (§7.2): employments derive their chapter via
          // participantProfile.chapterState.
          const rows = await this.prisma.participantEmployment.findMany({
            where: {
              deletedAt: null,
              status: 'active',
              ...(filters.state ? { participantProfile: { chapterState: filters.state } } : {}),
            },
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
          // Chapter scoping (§7.2): vehicles carry their own chapterState;
          // maintenance records derive it via the vehicle relation.
          const vehicleScope = filters.state ? { chapterState: filters.state } : {};
          const [active, latestMaintenance, registrationDue, insuranceDue] = await Promise.all([
            this.prisma.vehicle.count({ where: { deletedAt: null, active: true, ...vehicleScope } }),
            // Latest record per vehicle decides what is due — older records
            // are superseded by later service.
            this.prisma.vehicleMaintenanceRecord.findMany({
              where: { deletedAt: null, vehicle: { deletedAt: null, active: true, ...vehicleScope } },
              orderBy: { maintenanceDate: 'desc' },
              distinct: ['vehicleId'],
              select: {
                nextServiceDueDate: true,
                nextServiceDueMileage: true,
                vehicle: { select: { mileage: true } },
              },
            }),
            this.prisma.vehicle.count({
              where: {
                deletedAt: null,
                active: true,
                registrationExpiration: { lte: soon },
                ...vehicleScope,
              },
            }),
            this.prisma.vehicle.count({
              where: {
                deletedAt: null,
                active: true,
                insuranceExpiration: { lte: soon },
                ...vehicleScope,
              },
            }),
          ]);
          // Mirrors fleet computeAlerts (§6.10): due by date (within 30 days
          // or past) OR by mileage (within 500 miles of next due, or past).
          // One latest record per vehicle, so a vehicle due by both criteria
          // still counts once.
          const maintenanceDue = latestMaintenance.filter(
            (r) =>
              (r.nextServiceDueDate !== null && r.nextServiceDueDate <= soon) ||
              (r.nextServiceDueMileage !== null &&
                r.vehicle.mileage !== null &&
                r.nextServiceDueMileage <= r.vehicle.mileage + 500),
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
          // Chapter scoping (§7.2): case records derive their chapter via
          // participantProfile.chapterState.
          const caseScope = filters.state
            ? { participantProfile: { chapterState: filters.state } }
            : {};
          // §7.3: counts only — the dashboard never surfaces note content.
          const [notes, services, overdue, newMessages, pendingMeetings, pendingTransport] =
            await Promise.all([
              this.prisma.caseNote.count({
                where: { deletedAt: null, createdAt: { gte: weekAgo }, ...caseScope },
              }),
              this.prisma.caseService.count({
                where: { deletedAt: null, createdAt: { gte: weekAgo }, ...caseScope },
              }),
              this.prisma.caseNote.count({
                where: {
                  deletedAt: null,
                  followUpRequired: true,
                  followUpDoneAt: null,
                  followUpDate: { lt: todayUtc },
                  ...caseScope,
                },
              }),
              // Same "pending" definitions the Requests tabs badge.
              this.prisma.portalMessage.count({
                where: { deletedAt: null, status: 'new', ...caseScope },
              }),
              this.prisma.meetingRequest.count({
                where: { deletedAt: null, status: 'pending', ...caseScope },
              }),
              this.prisma.transportRequest.count({
                where: { deletedAt: null, status: 'pending', ...caseScope },
              }),
            ]);
          data.recentCaseActivity = { notes, services, total: notes + services };
          overdueFollowUps = overdue;
          portalRequestsPending = newMessages + pendingMeetings + pendingTransport;
        })(),
      );
    }

    if (hasPerm(user, 'intake_queues.read')) {
      tasks.push(
        (async () => {
          // §6.11: queue COUNTS only — referral content itself sits behind the
          // tighter referral_inbox.read permission, never on the dashboard.
          const slaCutoff = addDays(now, -3);
          // Chapter scoping (§7.2): intake queues carry their own state column;
          // legacy null-state rows are visible to all-chapters users only.
          const intakeScope = filters.state ? { state: filters.state } : {};
          const [volPending, refPending, oldestVol, oldestRef, volBreaches, refBreaches] =
            await Promise.all([
              this.prisma.volunteerApplication.count({
                where: { status: 'pending', ...intakeScope },
              }),
              this.prisma.referralInboxItem.count({
                where: { status: 'pending', ...intakeScope },
              }),
              this.prisma.volunteerApplication.findFirst({
                where: { status: 'pending', ...intakeScope },
                orderBy: { submittedAt: 'asc' },
                select: { submittedAt: true },
              }),
              this.prisma.referralInboxItem.findFirst({
                where: { status: 'pending', ...intakeScope },
                orderBy: { submittedAt: 'asc' },
                select: { submittedAt: true },
              }),
              this.prisma.volunteerApplication.count({
                where: { status: 'pending', submittedAt: { lt: slaCutoff }, ...intakeScope },
              }),
              this.prisma.referralInboxItem.count({
                where: { status: 'pending', submittedAt: { lt: slaCutoff }, ...intakeScope },
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
    if (portalRequestsPending > 0) {
      attentionNeeded.push({
        key: 'portal_requests_pending',
        label: 'Participant portal requests awaiting review',
        count: portalRequestsPending,
      });
    }
    if (unacknowledgedDonations > 0) {
      attentionNeeded.push({
        key: 'unacknowledged_donations',
        label: 'Donations awaiting acknowledgment',
        count: unacknowledgedDonations,
      });
    }
    if (pendingTimesheets > 0) {
      attentionNeeded.push({
        key: 'pending_timesheets',
        label: 'Volunteer timesheets awaiting approval',
        count: pendingTimesheets,
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
