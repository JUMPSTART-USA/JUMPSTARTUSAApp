/**
 * Clears demo/sample content from STAGING while leaving sign-in intact.
 *
 *   CONFIRM_RESET=yes pnpm --filter @jumpstart/database reset:staging-data
 *
 * DRY_RUN=1 does the whole thing inside the transaction, reports the counts it
 * would leave behind, then rolls back. Because TRUNCATE is transactional this
 * is a real rehearsal against real data, not a simulation of one — run it
 * first, every time.
 *
 * Kept: every account and everything sign-in depends on (users, roles,
 * permissions and their join tables, passkeys, TOTP recovery codes, password
 * reset tokens, region scopes) plus the session store, so nobody is logged
 * out mid-task. Also kept: app_settings and the three template tables, which
 * hold real configuration — wiping those breaks email and onboarding rather
 * than merely emptying a list.
 *
 * Removed: everything else, including institutions, the audit log, and
 * funds/campaigns/appeals. Institutions are real DOC facilities and can be
 * reloaded with `pnpm seed:institutions`.
 *
 * Two things make this safe to run, and both matter:
 *
 * 1. `persons` is DELETEd, never TRUNCATEd. users.person_id references it, and
 *    TRUNCATE ... CASCADE truncates every table with an FK to its target
 *    regardless of the constraint's ON DELETE action — so truncating persons
 *    would take the accounts with it. DELETE honours ON DELETE SET NULL and
 *    leaves the users behind with a null person_id.
 *
 * 2. The whole thing runs in one transaction (TRUNCATE is transactional in
 *    Postgres) and re-counts the kept tables before committing. If the account
 *    count moved by even one, it throws and the transaction rolls back, so a
 *    mistake costs nothing.
 *
 * Refuses a production-looking DATABASE_URL outright. Production has its own
 * script — seed-production.ts — which is a different operation: it wipes
 * accounts too and bootstraps a single admin.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Never emptied. Everything not in here is content. */
const KEEP = new Set([
  // Accounts and everything sign-in touches.
  'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
  'webauthn_credentials', 'totp_recovery_codes', 'password_reset_tokens',
  'user_region_scopes',
  // Express session store — clearing it would log everyone out for no gain.
  'session',
  // Configuration, not sample data.
  'app_settings', 'communication_templates', 'onboarding_checklist_templates',
  'mentor_screening_templates',
  // Prisma's own bookkeeping. Truncating it would strand every migration.
  '_prisma_migrations',
]);

/** Deleted rather than truncated — see the note above about users.person_id. */
const DELETE_NOT_TRUNCATE = ['persons'];

function assertNotProduction() {
  const url = process.env.DATABASE_URL ?? '';
  const host = /@([^/:]+)/.exec(url)?.[1] ?? '(unknown)';
  if (/prod/i.test(url)) {
    throw new Error(
      `Refusing to run: DATABASE_URL looks like production (host ${host}).\n` +
        'Production resets go through seed-production.ts, which is a different operation.',
    );
  }
  return host;
}

async function main() {
  // Flags as well as env vars: the container job passes a command line, and
  // run-migration-job.sh only forwards DATABASE_URL, so there is no way to set
  // CONFIRM_RESET on the container without teaching that shared script new tricks.
  const argv = process.argv.slice(2);
  const confirmed = process.env.CONFIRM_RESET === 'yes' || argv.includes('--confirm');

  if (!confirmed) {
    console.error(
      'Refusing to run: this empties every content table in the target database.\n' +
        'Pass --confirm (or set CONFIRM_RESET=yes) to proceed.',
    );
    process.exitCode = 1;
    return;
  }

  const host = assertNotProduction();
  console.log(`Target: ${host}\n`);

  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  const all = rows.map((r) => r.tablename);
  const truncate = all.filter((t) => !KEEP.has(t) && !DELETE_NOT_TRUNCATE.includes(t));

  const before = await counts();
  console.log(`${all.length} tables: keeping ${all.length - truncate.length - DELETE_NOT_TRUNCATE.length}, ` +
    `truncating ${truncate.length}, deleting ${DELETE_NOT_TRUNCATE.length}`);
  console.log('\nBefore:');
  report(before);

  const dryRun = process.env.DRY_RUN === '1' || argv.includes('--dry-run');
  class Rollback extends Error {}

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${truncate.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );
      // Last, and by DELETE: this is the table that would take the accounts with it.
      for (const t of DELETE_NOT_TRUNCATE) await tx.$executeRawUnsafe(`DELETE FROM "${t}"`);

      // Commit only if the accounts are untouched. TRUNCATE is transactional, so
    // throwing here rolls the entire operation back.
      const after = await countsWith(tx);
      for (const key of ['users', 'roles', 'permissions', 'webauthn_credentials', 'app_settings'] as const) {
        if (after[key] !== before[key]) {
          throw new Error(
            `Aborted: ${key} went from ${before[key]} to ${after[key]}. ` +
              'Nothing was changed — the transaction rolled back.',
          );
        }
      }

      console.log(dryRun ? '\nWould leave:' : '\nAfter:');
      report(after);
      if (dryRun) throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }

  if (dryRun) {
    console.log('\nDRY RUN — rolled back, nothing changed. Verifying that is true:');
    report(await counts());
    return;
  }
  console.log('\nDone. Institutions were removed too — reload them with `pnpm seed:institutions`.');
}

type Counts = Record<string, number>;
const COUNTED = [
  'users', 'roles', 'permissions', 'webauthn_credentials', 'app_settings',
  'communication_templates', 'session',
  'persons', 'donors', 'donations', 'institutions', 'audit_logs', 'funds', 'campaigns',
];

async function countsWith(client: {
  $queryRawUnsafe: <T>(q: string) => Promise<T>;
}): Promise<Counts> {
  const out: Counts = {};
  for (const t of COUNTED) {
    const r = await client.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM "${t}"`);
    out[t] = Number(r[0]?.n ?? 0);
  }
  return out;
}
const counts = () => countsWith(prisma);

function report(c: Counts) {
  for (const t of COUNTED) {
    console.log(`  ${KEEP.has(t) ? 'keep  ' : 'clear '} ${t.padEnd(26)} ${c[t]}`);
  }
}

main()
  .catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
