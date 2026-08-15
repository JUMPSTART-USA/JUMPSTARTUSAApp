/**
 * One-off backfill: encrypt TOTP secrets that were written before the column
 * held ciphertext.
 *
 *   ENCRYPTION_KEY=... pnpm --filter @jumpstart/database encrypt-secrets
 *
 * Idempotent — rows that are already ciphertext are skipped, so running it
 * twice is safe and running it after a partial failure resumes.
 *
 * Run it once per environment AFTER deploying the release that introduced
 * crypto.util.ts, and with the SAME ENCRYPTION_KEY that release runs with. The
 * API tolerates plaintext on read specifically so this ordering is safe: an
 * account whose second factor stopped working because of a deploy is an
 * account locked out of the platform.
 *
 * Deliberately duplicates the cipher rather than importing it from the API:
 * this package does not depend on apps/api, and a backfill that reaches across
 * that boundary is a backfill that breaks when the API is refactored. The
 * format is pinned by the API's own crypto.util.spec.ts.
 */
import { createCipheriv, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const PREFIX = 'v1';
const SEPARATOR = '.';

function requireKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      'ENCRYPTION_KEY must be set to 64 hex characters (32 bytes).\n' +
        'Use the SAME value the API is deployed with, or every secret this\n' +
        'writes will be unreadable by it.',
    );
  }
  return Buffer.from(raw, 'hex');
}

function encrypt(plaintext: string, context: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    PREFIX,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(SEPARATOR);
}

async function main() {
  const key = requireKey();
  const prisma = new PrismaClient();

  try {
    const users = await prisma.user.findMany({
      where: { totpSecret: { not: null } },
      select: { id: true, email: true, totpSecret: true },
    });

    let encrypted = 0;
    let alreadyDone = 0;

    for (const user of users) {
      const stored = user.totpSecret!;
      if (stored.startsWith(PREFIX + SEPARATOR)) {
        alreadyDone += 1;
        continue;
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecret: encrypt(stored, `totp-secret:${user.id}`, key) },
      });
      encrypted += 1;
      console.log(`  encrypted ${user.email}`);
    }

    console.log(
      `\nDone. ${encrypted} secret(s) encrypted, ${alreadyDone} already were, ` +
        `${users.length} total with a secret.`,
    );
    if (encrypted === 0 && alreadyDone === users.length && users.length > 0) {
      console.log('Every secret is ciphertext — the read-side plaintext tolerance can go.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
