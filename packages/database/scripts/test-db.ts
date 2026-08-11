/**
 * Creates, migrates and seeds the database the test suite uses.
 *
 *   pnpm --filter @jumpstart/database test:db
 *
 * The suite needs its own database: it runs the real app against real Postgres,
 * and sharing the dev database means anything else using the app — a browser
 * session signing in, someone clicking through a list — can change the counts
 * the tests assert on. See apps/api/test/setup.ts.
 *
 * Reads TEST_DATABASE_URL from the environment or the repo-root .env. Nothing
 * here touches DATABASE_URL, so the dev database is never at risk from running
 * this by accident.
 *
 * `prisma migrate deploy` creates the database if it does not exist, so no psql
 * or extra Postgres client is needed — which matters because this repo can run
 * its local Postgres either through docker-compose or through embedded-postgres.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Load the REPO-ROOT .env, which is where TEST_DATABASE_URL lives — explicitly,
 * not by walking upwards. packages/database has its own .env defining only
 * DATABASE_URL, so a first-match-wins walk finds that one and then reports
 * TEST_DATABASE_URL as missing when it is sitting right there in the root file.
 * Root first, then the package's own, since loadEnvFile does not overwrite
 * anything already set.
 */
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
for (const candidate of [
  path.join(REPO_ROOT, '.env'),
  path.join(__dirname, '..', '.env'),
]) {
  try {
    process.loadEnvFile(candidate);
  } catch {
    // missing file — that is fine, try the next
  }
}

const url = process.env.TEST_DATABASE_URL?.trim();

if (!url) {
  console.error(
    'TEST_DATABASE_URL is not set.\n\n' +
      'Add it to the repo-root .env, alongside DATABASE_URL — the same server and\n' +
      'credentials, a different database name:\n\n' +
      '  TEST_DATABASE_URL="postgresql://jumpstart:jumpstart_dev_password@localhost:5432/jumpstart_test?schema=public"\n',
  );
  process.exit(1);
}

const host = new URL(url).hostname;
const name = new URL(url).pathname.replace(/^\//, '');

if (!['localhost', '127.0.0.1', '::1', 'db', 'postgres'].includes(host)) {
  console.error(`Refusing to build a test database on a non-local host (${host}).`);
  process.exit(1);
}

// A guard against pointing this at the dev database and wiping it during a
// later reseed: the names have to differ.
const devName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) : '';
if (devName && name === devName) {
  console.error(
    `TEST_DATABASE_URL and DATABASE_URL both point at "${name}".\n` +
      'The point of this script is a SEPARATE database — give the test one its own name.',
  );
  process.exit(1);
}

const run = (label: string, args: string[]) => {
  console.log(`\n── ${label} ─────────────────────────────────────────`);
  execFileSync('pnpm', args, {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
};

console.log(`Building test database "${name}" on ${host}`);
run('migrate', ['exec', 'prisma', 'migrate', 'deploy']);
run('seed', ['exec', 'tsx', 'prisma/seed.ts']);

console.log(
  `\nDone. "${name}" is migrated and seeded.\n` +
    'pnpm --filter api test now runs against it, isolated from the dev database.\n' +
    'To rebuild it from scratch later: drop the database, then run this again.\n',
);
