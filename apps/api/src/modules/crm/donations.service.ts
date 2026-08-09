import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type {
  AcknowledgeDonationInput,
  DonationInput,
  ListQuery,
  SoftCreditInput,
} from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { assertChapterAccess } from '../../common/chapter.util';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { addFrequency, num, roundMoney, startOfUtcDay } from './giving.util';

export interface DonationListFilters {
  /** Chapter (§7.2) — forced to the user's chapter in the controller. */
  state?: string;
  donorId?: string;
  campaignId?: string;
  eventId?: string;
  fundId?: string;
  appealId?: string;
  pledgeId?: string;
  recurringGiftId?: string;
  isRecurring?: boolean;
  /** true → acknowledged gifts only; false → the acknowledgment queue. */
  acknowledged?: boolean;
  from?: Date;
  to?: Date;
}

// Whitelist of sortable columns — sortBy comes from the query string and must
// never reach Prisma unchecked.
const SORTABLE = new Set(['donationDate', 'amount', 'createdAt']);

const fmtDate = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class DonationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private buildWhere(filters: DonationListFilters, search?: string): Prisma.DonationWhereInput {
    return {
      deletedAt: null,
      ...(filters.donorId ? { donorId: filters.donorId } : {}),
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.eventId ? { eventId: filters.eventId } : {}),
      ...(filters.fundId ? { fundId: filters.fundId } : {}),
      ...(filters.appealId ? { appealId: filters.appealId } : {}),
      ...(filters.pledgeId ? { pledgeId: filters.pledgeId } : {}),
      ...(filters.recurringGiftId ? { recurringGiftId: filters.recurringGiftId } : {}),
      ...(filters.isRecurring !== undefined ? { isRecurring: filters.isRecurring } : {}),
      ...(filters.acknowledged !== undefined
        ? { acknowledgedAt: filters.acknowledged ? { not: null } : null }
        : {}),
      ...(filters.from || filters.to
        ? {
            donationDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      // Chapter scoping (§7.2): gifts derive chapter through their required
      // donor — one clause covers list and summary alike.
      ...(filters.state || search
        ? {
            donor: {
              ...(filters.state ? { chapterState: filters.state } : {}),
              ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
            },
          }
        : {}),
    };
  }

  async list(query: ListQuery, filters: DonationListFilters) {
    const where = this.buildWhere(filters, query.search);

    const orderBy: Prisma.DonationOrderByWithRelationInput =
      query.sortBy && SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { donationDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.donation.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          donor: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          event: { select: { id: true, name: true } },
          fund: { select: { id: true, name: true } },
          appeal: { select: { id: true, name: true } },
        },
      }),
      this.prisma.donation.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Giving totals over the same filter set the list accepts. */
  async summary(filters: DonationListFilters, search?: string) {
    const agg = await this.prisma.donation.aggregate({
      where: this.buildWhere(filters, search),
      _count: true,
      _sum: { amount: true },
      _avg: { amount: true },
    });
    return {
      count: agg._count,
      total: Number(agg._sum.amount ?? 0),
      average: agg._avg.amount ? roundMoney(Number(agg._avg.amount)) : 0,
    };
  }

  async get(id: string, user: AuthenticatedUser) {
    const donation = await this.prisma.donation.findFirst({
      where: { id, deletedAt: null },
      include: {
        donor: { select: { id: true, name: true, chapterState: true } },
        campaign: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
        fund: { select: { id: true, name: true } },
        appeal: { select: { id: true, name: true } },
        pledge: { select: { id: true, pledgeDate: true, totalAmount: true, status: true } },
        recurringGift: { select: { id: true, amount: true, frequency: true, status: true } },
        softCredits: {
          include: { donor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!donation) throw new NotFoundException('Donation not found');
    // Chapter scoping (§7.2): derived through the required donor.
    assertChapterAccess(user.chapter, donation.donor.chapterState);
    return donation;
  }

  async create(input: DonationInput, user: AuthenticatedUser) {
    const userId = user.id;
    await this.assertLinksExist(input, user);

    const donation = await this.prisma.donation.create({
      data: {
        ...input,
        // Payments on a giving schedule are recurring by definition.
        ...(input.recurringGiftId ? { isRecurring: true } : {}),
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'donation', donation.id, donation);

    if (donation.recurringGiftId) {
      await this.advanceRecurringGift(donation.recurringGiftId, donation.donationDate, userId);
    }
    if (donation.pledgeId) {
      await this.recomputePledgeStatus(donation.pledgeId, userId);
    }
    return donation;
  }

  async update(id: string, input: Partial<DonationInput>, user: AuthenticatedUser) {
    const userId = user.id;
    const found = await this.prisma.donation.findFirst({
      where: { id, deletedAt: null },
      include: { donor: { select: { chapterState: true } } },
    });
    if (!found) throw new NotFoundException('Donation not found');
    // Chapter scoping (§7.2): derived through the required donor.
    assertChapterAccess(user.chapter, found.donor.chapterState);
    const { donor: _donor, ...existing } = found;

    await this.assertLinksExist(input, user, existing);
    this.assertMergedRules(existing, input);

    const updated = await this.prisma.donation.update({
      where: { id },
      data: {
        ...input,
        // Payments on a giving schedule are recurring by definition; unlinking
        // clears the flag unless the payload sets it explicitly.
        ...(input.recurringGiftId
          ? { isRecurring: true }
          : input.recurringGiftId === null
            ? { isRecurring: input.isRecurring ?? false }
            : {}),
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'donation', id, existing, updated);

    // Amount or linkage changes shift pledge balances — recompute both sides.
    const pledgeTouched =
      input.amount !== undefined || input.pledgeId !== undefined || input.donationDate !== undefined;
    if (pledgeTouched) {
      if (existing.pledgeId && existing.pledgeId !== updated.pledgeId) {
        await this.recomputePledgeStatus(existing.pledgeId, userId);
      }
      if (updated.pledgeId) await this.recomputePledgeStatus(updated.pledgeId, userId);
    }
    // Date or linkage changes shift the recurring schedule — recompute both sides.
    const scheduleTouched =
      input.donationDate !== undefined || input.recurringGiftId !== undefined;
    if (scheduleTouched) {
      if (existing.recurringGiftId && existing.recurringGiftId !== updated.recurringGiftId) {
        await this.recomputeRecurringGiftSchedule(existing.recurringGiftId, userId);
      }
      if (updated.recurringGiftId) {
        await this.recomputeRecurringGiftSchedule(updated.recurringGiftId, userId);
      }
    }
    return updated;
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const found = await this.prisma.donation.findFirst({
      where: { id, deletedAt: null },
      include: { donor: { select: { chapterState: true } } },
    });
    if (!found) throw new NotFoundException('Donation not found');
    // Chapter scoping (§7.2): derived through the required donor.
    assertChapterAccess(user.chapter, found.donor.chapterState);
    const { donor: _donor, ...existing } = found;
    await this.prisma.donation.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: userId },
    });
    await this.audit.logDelete(userId, 'donation', id, existing);
    // A fulfilled pledge may fall short again once this payment is gone.
    if (existing.pledgeId) await this.recomputePledgeStatus(existing.pledgeId, userId);
    // The schedule must roll back if the deleted payment had advanced it.
    if (existing.recurringGiftId) {
      await this.recomputeRecurringGiftSchedule(existing.recurringGiftId, userId);
    }
    return { ok: true };
  }

  /** Acknowledgment workflow: stamp the gift and log the touchpoint (§6.8). */
  async acknowledge(id: string, input: AcknowledgeDonationInput, user: AuthenticatedUser) {
    const userId = user.id;
    const found = await this.prisma.donation.findFirst({
      where: { id, deletedAt: null },
      include: { donor: { select: { chapterState: true } } },
    });
    if (!found) throw new NotFoundException('Donation not found');
    // Chapter scoping (§7.2): derived through the required donor.
    assertChapterAccess(user.chapter, found.donor.chapterState);
    const { donor: _donor, ...existing } = found;
    if (existing.acknowledgedAt) {
      throw new ConflictException('Donation is already acknowledged');
    }

    const updated = await this.prisma.donation.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedById: userId,
        receiptSent: existing.receiptSent || input.sendReceipt,
        updatedById: userId,
      },
    });
    await this.audit.logUpdate(userId, 'donation', id, existing, updated);

    const interaction = await this.prisma.donorInteraction.create({
      data: {
        donorId: existing.donorId,
        date: startOfUtcDay(new Date()),
        channel: input.channel,
        purpose: 'acknowledgment',
        subject: `Gift acknowledged — $${Number(existing.amount).toFixed(2)} on ${fmtDate(existing.donationDate)}`,
        notes: input.notes,
        isInbound: false,
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.audit.logCreate(userId, 'donor_interaction', interaction.id, interaction);

    return updated;
  }

  // ── Soft credits ──────────────────────────────────────────────────────────
  // Credit a donor other than the payer — never counted in hard-credit totals.

  async addSoftCredit(donationId: string, input: SoftCreditInput, user: AuthenticatedUser) {
    const userId = user.id;
    const donation = await this.prisma.donation.findFirst({
      where: { id: donationId, deletedAt: null },
      include: { donor: { select: { chapterState: true } } },
    });
    if (!donation) throw new NotFoundException('Donation not found');
    // Chapter scoping (§7.2): the parent gift's donor governs access.
    assertChapterAccess(user.chapter, donation.donor.chapterState);
    if (input.donorId === donation.donorId) {
      throw new BadRequestException("Cannot soft-credit the gift's own donor");
    }
    const credited = await this.prisma.donor.findFirst({
      where: { id: input.donorId, deletedAt: null },
    });
    if (!credited) throw new BadRequestException('Credited donor not found');
    // Chapter scoping (§7.2): a scoped user can only credit donors they can
    // reach — cross-chapter soft credits are an all-chapters operation.
    assertChapterAccess(user.chapter, credited.chapterState);
    if (Number(input.amount) > Number(donation.amount)) {
      throw new BadRequestException('Soft credit cannot exceed the gift amount');
    }
    const duplicate = await this.prisma.softCredit.findFirst({
      where: { donationId, donorId: input.donorId },
    });
    if (duplicate) throw new ConflictException('This donor is already soft-credited on the gift');

    const softCredit = await this.prisma.softCredit.create({
      data: { ...input, donationId, createdById: userId, updatedById: userId },
    });
    await this.audit.logCreate(userId, 'soft_credit', softCredit.id, softCredit);
    return softCredit;
  }

  // No deletedAt column — delete exists for corrections; the audit row keeps history.
  async removeSoftCredit(id: string, user: AuthenticatedUser) {
    const userId = user.id;
    const found = await this.prisma.softCredit.findUnique({
      where: { id },
      include: { donation: { select: { donor: { select: { chapterState: true } } } } },
    });
    if (!found) throw new NotFoundException('Soft credit not found');
    // Chapter scoping (§7.2): the parent gift's donor governs access.
    assertChapterAccess(user.chapter, found.donation.donor.chapterState);
    const { donation: _donation, ...existing } = found;
    await this.prisma.softCredit.delete({ where: { id } });
    await this.audit.logDelete(userId, 'soft_credit', id, existing);
    return { ok: true };
  }

  // ── Schedule side effects ─────────────────────────────────────────────────

  /**
   * A pledge is fulfilled once payments cover total − written-off; deleting
   * or shrinking a payment can flip it back. Only active↔fulfilled flip
   * automatically — written-off/canceled stay put. Public so pledge edits
   * that move the threshold (total/write-off) can re-run the invariant.
   */
  async recomputePledgeStatus(pledgeId: string, userId: string) {
    const pledge = await this.prisma.pledge.findFirst({
      where: { id: pledgeId, deletedAt: null },
    });
    if (!pledge || (pledge.status !== 'active' && pledge.status !== 'fulfilled')) return;

    const agg = await this.prisma.donation.aggregate({
      where: { pledgeId, deletedAt: null },
      _sum: { amount: true },
    });
    const paid = Number(agg._sum.amount ?? 0);
    const due = roundMoney(num(pledge.totalAmount) - num(pledge.writtenOffAmount));
    const next = paid >= due ? 'fulfilled' : 'active';
    if (next !== pledge.status) {
      await this.prisma.pledge.update({
        where: { id: pledgeId },
        data: { status: next, updatedById: userId },
      });
      await this.audit.logUpdate(userId, 'pledge', pledgeId, { status: pledge.status }, { status: next });
    }
  }

  /** Advance the schedule to the first date after the recorded payment. */
  private async advanceRecurringGift(recurringGiftId: string, donationDate: Date, userId: string) {
    const rg = await this.prisma.recurringGift.findFirst({
      where: { id: recurringGiftId, deletedAt: null },
    });
    if (!rg) return;

    let next: Date;
    if (rg.nextGiftDate === null) {
      next = addFrequency(startOfUtcDay(donationDate), rg.frequency);
    } else if (donationDate >= rg.nextGiftDate) {
      next = rg.nextGiftDate;
      let guard = 0;
      while (next <= donationDate && guard < 600) {
        next = addFrequency(next, rg.frequency);
        guard += 1;
      }
    } else {
      return; // early payment — the schedule stands
    }

    await this.prisma.recurringGift.update({
      where: { id: recurringGiftId },
      data: { nextGiftDate: next, updatedById: userId },
    });
    await this.audit.logUpdate(
      userId,
      'recurring_gift',
      recurringGiftId,
      { nextGiftDate: rg.nextGiftDate },
      { nextGiftDate: next },
    );
  }

  /**
   * Re-derive nextGiftDate from the surviving payments — deleting or re-dating
   * a payment must roll the schedule back (or forward) to one period after the
   * latest remaining gift, or to the start date when none remain (mirroring
   * the default a new schedule gets).
   */
  private async recomputeRecurringGiftSchedule(recurringGiftId: string, userId: string) {
    const rg = await this.prisma.recurringGift.findFirst({
      where: { id: recurringGiftId, deletedAt: null },
    });
    if (!rg) return;

    const agg = await this.prisma.donation.aggregate({
      where: { recurringGiftId, deletedAt: null },
      _max: { donationDate: true },
    });
    const latest = agg._max.donationDate;
    const next = latest ? addFrequency(startOfUtcDay(latest), rg.frequency) : rg.startDate;
    if (rg.nextGiftDate !== null && rg.nextGiftDate.getTime() === next.getTime()) return;

    await this.prisma.recurringGift.update({
      where: { id: recurringGiftId },
      data: { nextGiftDate: next, updatedById: userId },
    });
    await this.audit.logUpdate(
      userId,
      'recurring_gift',
      recurringGiftId,
      { nextGiftDate: rg.nextGiftDate },
      { nextGiftDate: next },
    );
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /** The PATCH schema drops the cross-field refinements — re-check merged. */
  private assertMergedRules(
    existing: { tributeType: string | null; tributeName: string | null; amount: Prisma.Decimal; nonDeductibleAmount: Prisma.Decimal | null },
    input: Partial<DonationInput>,
  ) {
    const tributeType = input.tributeType !== undefined ? input.tributeType : existing.tributeType;
    const tributeName = input.tributeName !== undefined ? input.tributeName : existing.tributeName;
    if (tributeType && !tributeName) {
      throw new BadRequestException('Enter who this gift honors');
    }
    const amount = input.amount !== undefined ? Number(input.amount) : Number(existing.amount);
    const nonDeductible =
      input.nonDeductibleAmount !== undefined
        ? input.nonDeductibleAmount
        : existing.nonDeductibleAmount;
    if (nonDeductible !== null && nonDeductible !== undefined && Number(nonDeductible) > amount) {
      throw new BadRequestException('Non-deductible amount cannot exceed the gift amount');
    }
  }

  private async assertLinksExist(
    input: Partial<DonationInput>,
    user: AuthenticatedUser,
    existing?: { donorId: string; pledgeId: string | null; recurringGiftId: string | null },
  ) {
    // Resolve the MERGED donor's chapter first — the gift's chapter follows
    // its donor, and every linked designation must stay in that chapter.
    const donorId = input.donorId ?? existing?.donorId;
    let donorChapter: string | null = null;
    if (input.donorId) {
      const donor = await this.prisma.donor.findFirst({
        where: { id: input.donorId, deletedAt: null },
      });
      if (!donor) throw new BadRequestException('Donor not found');
      // Chapter scoping (§7.2): a scoped user cannot record gifts against
      // another chapter's donor.
      assertChapterAccess(user.chapter, donor.chapterState);
      donorChapter = donor.chapterState;
    } else if (existing && (input.campaignId || input.eventId || input.appealId)) {
      const donor = await this.prisma.donor.findFirst({ where: { id: existing.donorId } });
      donorChapter = donor?.chapterState ?? null;
    }
    if (input.campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: input.campaignId, deletedAt: null },
      });
      if (!campaign) throw new BadRequestException('Campaign not found');
      if (donorChapter && campaign.chapterState !== donorChapter) {
        throw new BadRequestException(
          "Campaign belongs to a different chapter than the gift's donor",
        );
      }
    }
    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
      });
      if (!event) throw new BadRequestException('Event not found');
      if (donorChapter && event.chapterState !== donorChapter) {
        throw new BadRequestException(
          "Event belongs to a different chapter than the gift's donor",
        );
      }
    }
    if (input.fundId) {
      const fund = await this.prisma.fund.findFirst({ where: { id: input.fundId } });
      if (!fund) throw new BadRequestException('Fund not found');
    }
    if (input.appealId) {
      const appeal = await this.prisma.appeal.findFirst({
        where: { id: input.appealId, deletedAt: null },
        include: { campaign: { select: { chapterState: true } } },
      });
      if (!appeal) throw new BadRequestException('Appeal not found');
      // A standalone appeal (no campaign) is org-global and matches any donor.
      if (donorChapter && appeal.campaign && appeal.campaign.chapterState !== donorChapter) {
        throw new BadRequestException(
          "Appeal belongs to a different chapter than the gift's donor",
        );
      }
    }
    // Ownership is enforced against the MERGED record — a PATCH carrying only
    // pledgeId, only recurringGiftId, or only donorId must never leave a gift
    // counting toward another donor's schedule.
    const pledgeId = input.pledgeId !== undefined ? input.pledgeId : (existing?.pledgeId ?? null);
    const recurringGiftId =
      input.recurringGiftId !== undefined ? input.recurringGiftId : (existing?.recurringGiftId ?? null);

    if (pledgeId) {
      const pledge = await this.prisma.pledge.findFirst({
        where: { id: pledgeId, deletedAt: null },
      });
      if (!pledge) throw new BadRequestException('Pledge not found');
      if (donorId && pledge.donorId !== donorId) {
        throw new BadRequestException('Pledge belongs to a different donor');
      }
    }
    if (recurringGiftId) {
      const rg = await this.prisma.recurringGift.findFirst({
        where: { id: recurringGiftId, deletedAt: null },
      });
      if (!rg) throw new BadRequestException('Recurring gift not found');
      if (donorId && rg.donorId !== donorId) {
        throw new BadRequestException('Recurring gift belongs to a different donor');
      }
    }
  }
}
