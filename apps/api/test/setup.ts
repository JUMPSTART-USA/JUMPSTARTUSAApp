/**
 * Points the test suite at its own database, before anything imports Prisma.
 *
 * The suite runs the real app against a real Postgres, and it used to use the
 * SAME database as the local dev API on :3001. That makes a local run depend on
 * whatever else is touching that database: signing in through the browser writes
 * an audit row, clicking around creates and updates records, and several
 * assertions compare live counts (e.g. api.e2e.spec.ts asserts that a
 * chapter-scoped participant list is smaller than the unscoped one). A run on
 * 2026-08-10 failed one test while a browser session was hitting the dev API,
 * then passed five times in a row — the signature of exactly that interference.
 *
 * Set TEST_DATABASE_URL and the suite uses it instead. It has to happen in a
 * vitest setupFile rather than inside a test, because AppModule -> PrismaService
 * reads DATABASE_URL the moment it is imported.
 *
 * Why an override variable rather than changing DATABASE_URL itself: CI already
 * gets isolation for free from its own throwaway Postgres service container, and
 * only migrates and seeds the database named in its DATABASE_URL. Leaving
 * TEST_DATABASE_URL unset there keeps CI working exactly as before.
 *
 * First-time local setup:  pnpm --filter @jumpstart/database test:db
 */

// The env file is loaded here as well as in the app's loadEnv(), because this
// file runs first and needs TEST_DATABASE_URL from it. Node's loadEnvFile does
// not overwrite variables that are already set, so a real shell variable still
// wins over the file in both places.
//
// Every candidate is tried rather than stopping at the first that exists:
// TEST_DATABASE_URL lives in the repo-root .env, and a first-match-wins walk
// would silently miss it the moment someone adds an apps/api/.env. Root-most
// first, so the root file's values take precedence.
for (const candidate of ['../../.env', '../.env', '.env']) {
  try {
    process.loadEnvFile(candidate);
  } catch {
    // missing file — that is fine, try the next
  }
}

const testUrl = process.env.TEST_DATABASE_URL?.trim();

if (testUrl) {
  process.env.DATABASE_URL = testUrl;
} else if (!process.env.CI) {
  // Not fatal, and deliberately silent in CI, which is already isolated by its
  // own throwaway Postgres container. Locally it is worth saying out loud, so
  // nobody shares the dev database again without knowing it.
  console.warn(
    '[test setup] TEST_DATABASE_URL is not set — running against DATABASE_URL.\n' +
      '             That shares the dev database, so anything else using the app\n' +
      '             can perturb results. To fix: pnpm db:test-db',
  );
}

/**
 * The suite creates, updates and soft-deletes real records, so refuse to run it
 * against anything that is not obviously a local database. Without this, a
 * stray DATABASE_URL in the shell is enough to point it at staging.
 */
const target = process.env.DATABASE_URL ?? '';
const host = (() => {
  try {
    return new URL(target).hostname;
  } catch {
    return '';
  }
})();
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db', 'postgres']);

if (host && !LOCAL_HOSTS.has(host) && process.env.ALLOW_REMOTE_TEST_DB !== 'true') {
  throw new Error(
    `[test setup] Refusing to run the suite against a non-local database (${host}).\n` +
      'These tests write data. Point TEST_DATABASE_URL at a local database, or set\n' +
      'ALLOW_REMOTE_TEST_DB=true if you genuinely mean to use a remote one.',
  );
}
