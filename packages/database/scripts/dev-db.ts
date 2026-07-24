/**
 * Local development database WITHOUT Docker: runs an embedded Postgres 17 on
 * port 5432 with the same credentials docker-compose uses, so DATABASE_URL in
 * .env works unchanged either way. Data persists in packages/database/.pgdata
 * (gitignored).
 *
 *   pnpm --filter @jumpstart/database db:local
 *
 * Stop with Ctrl-C. Prefer docker-compose (postgres:16) where Docker exists —
 * this script is the fallback for machines without it.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(__dirname, '..', '.pgdata');

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'jumpstart',
    password: 'jumpstart_dev_password',
    port: 5432,
    persistent: true,
  });

  // A cluster is initialized iff PG_VERSION exists in the data dir.
  if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    await pg.initialise();
  }

  await pg.start();
  try {
    await pg.createDatabase('jumpstart');
    console.log('Created database "jumpstart"');
  } catch {
    // exists — fine
  }

  console.log(
    'Postgres ready on postgresql://jumpstart:jumpstart_dev_password@localhost:5432/jumpstart',
  );
  console.log('Press Ctrl-C to stop.');

  const shutdown = async () => {
    console.log('\nStopping embedded Postgres…');
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
