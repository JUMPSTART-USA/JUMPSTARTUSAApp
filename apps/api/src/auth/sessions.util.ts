import type { Prisma } from '@jumpstart/database';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Any client that can run raw SQL — the PrismaService, or the transaction
 * client handed to a $transaction callback, so a revocation can be part of a
 * larger atomic change (see the staff-departure flow).
 */
type SqlRunner = Pick<PrismaService | Prisma.TransactionClient, '$executeRaw'>;

/**
 * Kill every live session belonging to a user. Returns how many were revoked.
 *
 * THE one place this SQL lives. It used to be copy-pasted into the password
 * reset and the staff-departure flow, and — the reason this function exists —
 * was simply missing from the third caller: changing your own password only
 * destroyed the browser tab you were sitting in. So the single most common
 * user-initiated security action ("I think someone has my password") was the
 * one that did not lock anybody out; a stolen session survived it for the rest
 * of the 12-hour absolute window while the user believed otherwise.
 *
 * Sessions live in connect-pg-simple's table with the user id inside the sess
 * JSON, which is why this is raw SQL rather than a Prisma delete: `userId` is
 * not a column. The value is still parameterised by the tagged template.
 */
export function revokeAllSessions(client: SqlRunner, userId: string): Promise<number> {
  return client.$executeRaw`DELETE FROM "session" WHERE sess->>'userId' = ${userId}`;
}
