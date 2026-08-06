import type { Prisma } from '@jumpstart/database';
import type { GiftFrequency } from '@jumpstart/shared';

// Date/money helpers shared by the giving services (donations, pledges,
// recurring gifts) and the development reports — schedule math must agree
// everywhere balances and arrears are computed.

export const DAY_MS = 86_400_000;

export const addDays = (base: Date, days: number): Date =>
  new Date(base.getTime() + days * DAY_MS);

/** Midnight UTC — matches how @db.Date columns store values. */
export const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Adds calendar months in UTC, clamping to the target month's last day. */
export const addUtcMonths = (d: Date, months: number): Date => {
  const anchor = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const daysInMonth = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), Math.min(d.getUTCDate(), daysInMonth)),
  );
};

/** Next scheduled date after one period of the given frequency. */
export const addFrequency = (d: Date, frequency: GiftFrequency): Date => {
  switch (frequency) {
    case 'weekly':
      return addDays(d, 7);
    case 'biweekly':
      return addDays(d, 14);
    case 'monthly':
      return addUtcMonths(d, 1);
    case 'quarterly':
      return addUtcMonths(d, 3);
    case 'semiannually':
      return addUtcMonths(d, 6);
    case 'annually':
      return addUtcMonths(d, 12);
  }
};

/**
 * Number of installments that have come due on or before `today` (the first
 * installment is due at the start date). Bounded so a malformed schedule can
 * never spin.
 */
export const elapsedPeriods = (start: Date, frequency: GiftFrequency, today: Date): number => {
  let count = 0;
  let cursor = start;
  while (cursor <= today && count < 1_000) {
    count += 1;
    cursor = addFrequency(cursor, frequency);
  }
  return count;
};

export const num = (v: Prisma.Decimal | number | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v);

export const roundMoney = (v: number): number => Math.round(v * 100) / 100;

/** Fields needed to compute a pledge's balance/arrears — never stored. */
export interface PledgeScheduleFields {
  totalAmount: Prisma.Decimal;
  writtenOffAmount: Prisma.Decimal | null;
  installmentAmount: Prisma.Decimal | null;
  frequency: GiftFrequency | null;
  startDate: Date | null;
}

export interface PledgeComputed {
  amountPaid: number;
  balance: number;
  percentPaid: number | null;
  /** Installments due to date × installment amount, capped at total − written-off; null without a schedule. */
  expectedToDate: number | null;
  inArrears: boolean;
}

export const pledgeComputed = (
  pledge: PledgeScheduleFields,
  amountPaid: number,
  today: Date,
): PledgeComputed => {
  const total = num(pledge.totalAmount);
  const writtenOff = num(pledge.writtenOffAmount);
  const balance = roundMoney(total - writtenOff - amountPaid);
  const percentPaid = total > 0 ? Math.round((amountPaid / total) * 100) : null;
  const expectedToDate =
    pledge.installmentAmount !== null && pledge.frequency !== null && pledge.startDate !== null
      ? Math.min(
          roundMoney(num(pledge.installmentAmount) * elapsedPeriods(pledge.startDate, pledge.frequency, today)),
          // Cap at the collectible amount — a written-off portion is settled,
          // not owed, so it must never keep a pledge in arrears.
          Math.max(0, roundMoney(total - writtenOff)),
        )
      : null;
  return {
    amountPaid,
    balance,
    percentPaid,
    expectedToDate,
    inArrears: expectedToDate !== null && amountPaid < expectedToDate,
  };
};

export type DonorLifecycle = 'prospective' | 'new' | 'active' | 'lapsed' | 'inactive';

/**
 * Donor lifecycle from hard-credit gift dates: prospective (no gifts), new
 * (entire history within 12 months), active (gave within 12 months), lapsed
 * (12–24 months), inactive (over 24 months).
 */
export const donorLifecycle = (
  firstGiftDate: Date | null | undefined,
  lastGiftDate: Date | null | undefined,
  now: Date,
): DonorLifecycle => {
  if (!firstGiftDate || !lastGiftDate) return 'prospective';
  const cutoff12 = addUtcMonths(now, -12);
  const cutoff24 = addUtcMonths(now, -24);
  if (lastGiftDate >= cutoff12) return firstGiftDate >= cutoff12 ? 'new' : 'active';
  if (lastGiftDate >= cutoff24) return 'lapsed';
  return 'inactive';
};

/** Percent of goal (1 decimal), null when no goal is set. */
export const progressPct = (goalAmount: Prisma.Decimal | null, raised: number): number | null => {
  const goal = goalAmount ? Number(goalAmount) : 0;
  if (!goal) return null;
  return Math.round((raised / goal) * 1000) / 10;
};
