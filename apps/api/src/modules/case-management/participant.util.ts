import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves a body-supplied participant FK to a live profile. Without this,
 * a bad id surfaces as a Prisma P2003 (500) instead of a 400.
 */
export async function assertParticipant(prisma: PrismaService, participantProfileId: string) {
  const profile = await prisma.participantProfile.findFirst({
    where: { id: participantProfileId, deletedAt: null },
  });
  if (!profile) throw new BadRequestException('Unknown participant');
  return profile;
}

export function personName(
  person: { firstName: string; lastName: string } | null | undefined,
): string | null {
  return person ? `${person.firstName} ${person.lastName}` : null;
}

/**
 * `@db.Date` columns come back as UTC midnight of the calendar date, so
 * comparisons must happen on the calendar-date string — comparing Date
 * objects lets the server timezone shift a due date across days.
 */
export function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date from the server's local clock (staff perspective). */
export function localTodayStr(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${day}`;
}

/** UTC midnight of today — the `lt` boundary for "overdue" on @db.Date columns. */
export function todayUtcMidnight(): Date {
  return new Date(`${localTodayStr()}T00:00:00.000Z`);
}
