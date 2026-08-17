import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Not import.meta (the tsconfig typechecks as CommonJS) and not bare require
// (vitest runs this as ESM): resolve from the package root, where vitest runs.
const load = createRequire(join(process.cwd(), 'package.json'));

/**
 * pg v8 treats `sslmode=require` in a connection string as an alias for
 * `verify-full`, so the session pool (app.setup.ts) verifies the server
 * certificate today. pg v9 adopts libpq semantics, where `require` stops
 * verifying — and the shared DATABASE_URL cannot say `verify-full` instead,
 * because Prisma 6.x does not recognise that value and silently falls back to
 * plaintext-permitted. Both behaviours were measured, not read about:
 * docs/database-roles.md, "Certificate verification".
 *
 * This pin exists so the pg 9 bump cannot land as a routine dependency PR and
 * quietly stop verifying the database's certificate. To move to v9: give the
 * pool in app.setup.ts explicit `ssl` options (independent of URL sslmode),
 * prove a staging connection still verifies, then delete this test.
 */
describe('pg major version pin', () => {
  it('stays on v8 until the session pool gets explicit ssl config', () => {
    const { version } = load('pg/package.json') as { version: string };
    expect(version.split('.')[0]).toBe('8');
  });
});
