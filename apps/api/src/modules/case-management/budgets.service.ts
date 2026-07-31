import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import type { BudgetItemInput, BudgetPaymentInput, ListQuery } from '@jumpstart/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertParticipant } from './participant.util';

export type BudgetItemUpdateInput = Partial<BudgetItemInput>;
export type BudgetPaymentUpdateInput = Partial<BudgetPaymentInput>;

export interface BudgetPaymentListFilters {
  participantProfileId?: string;
  budgetItemId?: string;
}

const PAYMENT_SORTABLE = new Set(['paidDate', 'amount', 'method', 'createdAt']);

const ITEM_SELECT = {
  id: true,
  participantProfileId: true,
  category: true,
  label: true,
  amount: true,
  frequency: true,
  startDate: true,
  endDate: true,
  active: true,
  notes: true,
} as const;

/** Payment rows carry a budget-item summary so lists can label the obligation. */
const PAYMENT_SELECT = {
  id: true,
  budgetItemId: true,
  participantProfileId: true,
  paidDate: true,
  amount: true,
  method: true,
  notes: true,
  createdAt: true,
  budgetItem: { select: { id: true, category: true, label: true } },
} as const;

type BudgetItemRow = Prisma.BudgetItemGetPayload<{ select: typeof ITEM_SELECT }>;
type BudgetPaymentRow = Prisma.BudgetPaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

interface PaymentAggregate {
  lastPaidDate: Date | null;
  totalPaid: string;
}

/**
 * Item views add payment roll-ups: lastPaidDate (latest non-deleted payment)
 * and totalPaid (Decimal sum, serialized as a string like every Prisma
 * Decimal — the web renders it with formatMoney).
 */
function toItemView(row: BudgetItemRow, agg?: PaymentAggregate) {
  return {
    ...row,
    lastPaidDate: agg?.lastPaidDate ?? null,
    totalPaid: agg?.totalPaid ?? '0',
  };
}

export type BudgetItemView = ReturnType<typeof toItemView>;
export type BudgetPaymentView = BudgetPaymentRow;

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Budget items ───────────────────────────────────────────────────────────

  /** All non-deleted items for one participant: active first, then category. */
  async listItems(participantProfileId: string): Promise<{ items: BudgetItemView[] }> {
    const rows = await this.prisma.budgetItem.findMany({
      where: { participantProfileId, deletedAt: null },
      orderBy: [{ active: 'desc' }, { category: 'asc' }],
      select: ITEM_SELECT,
    });
    const aggregates = await this.paymentAggregates(rows.map((r) => r.id));
    return { items: rows.map((r) => toItemView(r, aggregates.get(r.id))) };
  }

  async createItem(input: BudgetItemInput, userId: string) {
    await assertParticipant(this.prisma, input.participantProfileId);
    const created = await this.prisma.budgetItem.create({
      data: { ...input, createdById: userId },
      select: ITEM_SELECT,
    });
    const view = toItemView(created);
    await this.audit.logCreate(userId, 'budget_item', created.id, view);
    return view;
  }

  async updateItem(id: string, input: BudgetItemUpdateInput, userId: string) {
    const existing = await this.findItem(id);
    const movingParticipant =
      input.participantProfileId !== undefined &&
      input.participantProfileId !== existing.participantProfileId;
    if (input.participantProfileId) await assertParticipant(this.prisma, input.participantProfileId);

    let updated: BudgetItemRow;
    if (movingParticipant) {
      // Payments derive participantProfileId from their item — keep them in
      // lockstep if an item is ever reassigned to another participant.
      const [row] = await this.prisma.$transaction([
        this.prisma.budgetItem.update({ where: { id }, data: input, select: ITEM_SELECT }),
        this.prisma.budgetPayment.updateMany({
          where: { budgetItemId: id },
          data: { participantProfileId: input.participantProfileId },
        }),
      ]);
      updated = row;
    } else {
      updated = await this.prisma.budgetItem.update({
        where: { id },
        data: input,
        select: ITEM_SELECT,
      });
    }

    const aggregates = await this.paymentAggregates([id]);
    const view = toItemView(updated, aggregates.get(id));
    await this.audit.logUpdate(userId, 'budget_item', id, toItemView(existing), view);
    return view;
  }

  /** Soft delete. The item's payments are intentionally left untouched. */
  async softDeleteItem(id: string, userId: string) {
    const existing = await this.findItem(id);
    await this.prisma.budgetItem.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.logDelete(userId, 'budget_item', id, toItemView(existing));
    return { ok: true };
  }

  // ── Budget payments ────────────────────────────────────────────────────────

  async listPayments(query: ListQuery, filters: BudgetPaymentListFilters) {
    const where: Prisma.BudgetPaymentWhereInput = {
      deletedAt: null,
      ...(filters.participantProfileId
        ? { participantProfileId: filters.participantProfileId }
        : {}),
      ...(filters.budgetItemId ? { budgetItemId: filters.budgetItemId } : {}),
    };

    const orderBy: Prisma.BudgetPaymentOrderByWithRelationInput =
      query.sortBy && PAYMENT_SORTABLE.has(query.sortBy)
        ? { [query.sortBy]: query.sortDir }
        : { paidDate: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.budgetPayment.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: PAYMENT_SELECT,
      }),
      this.prisma.budgetPayment.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createPayment(input: BudgetPaymentInput, userId: string) {
    // participantProfileId is derived from the item, never taken from the
    // body — the item must be live and belong to a real participant.
    const participantProfileId = await this.resolveItemParticipant(input.budgetItemId);
    const created = await this.prisma.budgetPayment.create({
      data: { ...input, participantProfileId, createdById: userId },
      select: PAYMENT_SELECT,
    });
    await this.audit.logCreate(userId, 'budget_payment', created.id, created);
    return created;
  }

  async updatePayment(id: string, input: BudgetPaymentUpdateInput, userId: string) {
    const existing = await this.findPayment(id);
    const data: Prisma.BudgetPaymentUncheckedUpdateInput = { ...input };
    if (input.budgetItemId && input.budgetItemId !== existing.budgetItemId) {
      // Re-derive the participant when the payment moves to another item.
      data.participantProfileId = await this.resolveItemParticipant(input.budgetItemId);
    }
    const updated = await this.prisma.budgetPayment.update({
      where: { id },
      data,
      select: PAYMENT_SELECT,
    });
    await this.audit.logUpdate(userId, 'budget_payment', id, existing, updated);
    return updated;
  }

  async softDeletePayment(id: string, userId: string) {
    const existing = await this.findPayment(id);
    await this.prisma.budgetPayment.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.logDelete(userId, 'budget_payment', id, existing);
    return { ok: true };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Sum + latest paidDate of non-deleted payments, keyed by budgetItemId. */
  private async paymentAggregates(itemIds: string[]): Promise<Map<string, PaymentAggregate>> {
    if (itemIds.length === 0) return new Map();
    const groups = await this.prisma.budgetPayment.groupBy({
      by: ['budgetItemId'],
      where: { budgetItemId: { in: itemIds }, deletedAt: null },
      _sum: { amount: true },
      _max: { paidDate: true },
    });
    return new Map(
      groups.map((g) => [
        g.budgetItemId,
        {
          lastPaidDate: g._max.paidDate ?? null,
          totalPaid: g._sum.amount?.toString() ?? '0',
        },
      ]),
    );
  }

  /** Live budget item → its participant id (400 on a bad/deleted item). */
  private async resolveItemParticipant(budgetItemId: string): Promise<string> {
    const item = await this.prisma.budgetItem.findFirst({
      where: { id: budgetItemId, deletedAt: null },
      select: { participantProfileId: true },
    });
    if (!item) throw new BadRequestException('Unknown budget item');
    await assertParticipant(this.prisma, item.participantProfileId);
    return item.participantProfileId;
  }

  private async findItem(id: string): Promise<BudgetItemRow> {
    const item = await this.prisma.budgetItem.findFirst({
      where: { id, deletedAt: null },
      select: ITEM_SELECT,
    });
    if (!item) throw new NotFoundException('Budget item not found');
    return item;
  }

  private async findPayment(id: string): Promise<BudgetPaymentRow> {
    const payment = await this.prisma.budgetPayment.findFirst({
      where: { id, deletedAt: null },
      select: PAYMENT_SELECT,
    });
    if (!payment) throw new NotFoundException('Budget payment not found');
    return payment;
  }
}
