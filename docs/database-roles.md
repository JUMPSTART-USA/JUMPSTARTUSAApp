# Database roles

The API, the migration job and the seed job all connect as `jumpstart_admin` —
the PostgreSQL flexible-server administrator. This document is the runbook for
splitting that into two least-privilege roles.

It is **not** applied automatically. Creating roles needs administrator rights,
which the migration job deliberately will not have once this is done, so it is a
one-off operator step per environment.

## Why

**The audit log is not actually append-only.** `AuditService` has no update or
delete method and no permission grants one, which is the right design — but the
role the API runs as can `DELETE FROM audit_logs`, or drop the table. The
tamper-evidence the design claims is enforced only by the absence of code that
exercises it. Anyone who reaches the connection string can rewrite the record of
what they did.

**Any SQL flaw arrives holding DDL.** Prisma parameterises everything and the
one raw query in the codebase uses a tagged template, so there is no known
injection today. The point is what a future one would cost.

## What it creates

| Role | Holds | Used by |
| --- | --- | --- |
| `app_runtime` | `SELECT, INSERT, UPDATE, DELETE` on application tables; `INSERT, SELECT` only on `audit_logs` | the API |
| `app_migrator` | Owns the `public` schema — the only role that may change shape | `prisma migrate deploy`, the seed jobs |

`jumpstart_admin` stays as the break-glass account. Nothing routine should use
it again.

## Applying it

Generate two passwords and keep them wherever `SESSION_SECRET` lives:

```bash
openssl rand -hex 24    # app_runtime
openssl rand -hex 24    # app_migrator
```

Run the script as the administrator, against the `jumpstart` database:

```bash
psql "$ADMIN_DATABASE_URL" -v app_password="'<runtime-password>'" -v migrator_password="'<migrator-password>'" -f packages/database/scripts/least-privilege-roles.sql
```

**That command cannot run from a laptop, and not from the migrate image either.**
The database has no public endpoint, and `apps/api/Dockerfile`'s migrate stage
is `node:24-alpine` with no `postgresql-client` — there is no psql in this
system that can reach the server. Use a one-off container in the jobs subnet
built on an image that *does* ship psql:

```bash
az container create -g "$AZURE_RG" -n apply-db-roles \
  --image postgres:16-alpine \
  --subnet "$JOBS_SUBNET_ID" --assign-identity "$JOBS_IDENTITY_ID" \
  --os-type Linux --cpu 1 --memory 1.5 --restart-policy Never \
  --secure-environment-variables ADMIN_DATABASE_URL="$ADMIN_URL" SQL_B64="$SQL_B64" \
  --command-line "sh -c 'echo \$SQL_B64 | base64 -d > /tmp/r.sql && psql \"\$ADMIN_DATABASE_URL\" -v app_password=\"'\\''<runtime-pw>'\\''\" -v migrator_password=\"'\\''<migrator-pw>'\\''\" -f /tmp/r.sql'"
```

(`SQL_B64` is the script base64-encoded locally. Unlike the Node job container,
psql has no workspace to resolve against, so `/tmp` is fine here.)

It is idempotent — re-running rotates the passwords and re-applies the grants.
It prints the resulting `audit_logs` privileges; expect exactly `INSERT` and
`SELECT`.

Then repoint the connection strings. In Key Vault, `database-url` becomes the
`app_runtime` credential, and the migration job gets `app_migrator`.

**This part is not yet wired up, and is the real work of applying this
runbook.** As of 2026-08-16 `infra/main.bicep` defines exactly one database
secret — `database-url` (built from the *admin* credential) — and
`.github/scripts/run-migration-job.sh` reads that same secret for migrations.
So repointing `database-url` at `app_runtime` would hand the migration job a
role with no DDL, and the next release would fail on its first `CREATE TABLE`.
Applying this requires, in one change:

1. A second Key Vault secret (`migrator-database-url`) in `infra/main.bicep`.
2. `run-migration-job.sh` reading that secret instead of `database-url`.
3. Both secrets set for an environment *before* its next deploy.

Note `database-url` is currently *derived* from `postgresAdminPassword` in the
template; it is only written when that param is non-empty (empty means "leave
Key Vault alone"), so a hand-set `app_runtime` value survives ordinary
deployments — but passing an admin password again would overwrite it back to
the administrator credential.

## Order matters

Apply the script **before** switching `DATABASE_URL`, and switch the migration
job's credential in the same release as the API's. A migration running as
`app_runtime` fails on the first `CREATE TABLE`; an API running as
`app_migrator` works but gives away the whole point.

Future migrations are covered: `ALTER DEFAULT PRIVILEGES` grants `app_runtime`
DML on tables `app_migrator` creates later. Without that line the next migration
would silently lock the API out of its own new table.

**Existing tables are covered by an ownership transfer, which grants alone
cannot replace.** Postgres requires *ownership* for `ALTER TABLE`, `CREATE
INDEX` and `DROP`; `GRANT ALL ON SCHEMA public` only permits creating new
objects. Every table was created by `prisma migrate` running as the
administrator, so the administrator owned all of them, and an earlier version of
this script stopped at the grant. Verified against a real database: without the
transfer, `ALTER TABLE audit_logs ADD COLUMN` as `app_migrator` fails with
`must be owner of table audit_logs` — and essentially every migration alters
something that already exists, so the *next* release after applying this would
have broken. The script now reassigns tables, sequences and views at the end,
and adds the administrator to `app_migrator` so it keeps the rights needed to
re-run the script (on Azure the administrator is not a superuser, only a member
of `azure_pg_admin`).

Verified end to end on a throwaway database carrying the real schema: the script
applies cleanly twice, `app_migrator` can run every migration DDL,
`app_runtime` keeps `SELECT`/`INSERT` on `audit_logs` while `UPDATE`/`DELETE`
and all DDL are refused, and a table `app_migrator` creates afterwards is
immediately writable by `app_runtime`.

If a future feature genuinely needs to modify an audit row, that is a design
conversation, not a grant — the answer is almost certainly a new row.

## Certificate verification: measured, and deliberately staying at `require`

An earlier version of this section claimed `sslmode=require` encrypts but does
not verify the server certificate, and named `verify-full` as the correct
setting. For this stack that is half wrong, and the "obvious fix" would have
made security worse. `DATABASE_URL` is parsed by **two clients with different
sslmode semantics** (measured 2026-08-17, pg 8.23 / Prisma 6.19):

| `sslmode=`    | node-postgres (session pool, one-off scripts)          | Prisma (ORM, migrations)                                     |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| `require`     | alias for `verify-full`: TLS + CA + hostname verified  | TLS mandatory, certificate not verified                       |
| `verify-full` | full verification                                      | **unrecognized — silent fallback to `prefer`, plaintext OK**  |

So `require` is the strongest setting the shared URL supports: pg verifies
fully, Prisma at least refuses plaintext. Pinning `verify-full` would keep pg
exactly where it already is and silently downgrade every Prisma connection —
the API's ORM traffic and the migrations — to plaintext-permitted. Proven
empirically against a server with TLS disabled: Prisma with `sslmode=require`
refuses to connect; with `sslmode=verify-full` it connects happily in
plaintext. Unknown *values* of a known key do not error, they fall back.

Two futures to watch, both covered:

- **pg v9 adopts libpq semantics**, where `require` stops verifying. The
  tripwire test `apps/api/test/pg-sslmode-tripwire.spec.ts` pins the major at
  8 and fails the build with instructions when someone bumps it: give the
  session pool in `app.setup.ts` explicit `ssl` options (independent of the
  URL), prove a staging connection still verifies, then retire the pin.
- **Prisma may learn `verify-full`** in a future major. When its changelog
  says so, re-run the measurement above against the real Azure server —
  nothing else proves it — and only then change the vault secrets.

The database remains on a private VNet with no public endpoint, so what
`require` leaves open on the Prisma side is an active man-in-the-middle
already inside the VNet — defence in depth, not an open door.
