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

It is idempotent — re-running rotates the passwords and re-applies the grants.
It prints the resulting `audit_logs` privileges; expect exactly `INSERT` and
`SELECT`.

Then repoint the connection strings. In Key Vault, `database-url` becomes the
`app_runtime` credential, and the migration job gets `app_migrator`. Both are
referenced from `infra/main.bicep`.

## Order matters

Apply the script **before** switching `DATABASE_URL`, and switch the migration
job's credential in the same release as the API's. A migration running as
`app_runtime` fails on the first `CREATE TABLE`; an API running as
`app_migrator` works but gives away the whole point.

Future migrations are covered: `ALTER DEFAULT PRIVILEGES` grants `app_runtime`
DML on tables `app_migrator` creates later. Without that line the next migration
would silently lock the API out of its own new table.

If a future feature genuinely needs to modify an audit row, that is a design
conversation, not a grant — the answer is almost certainly a new row.

## Still open: certificate verification

`DATABASE_URL` uses `sslmode=require`, which encrypts but does **not** verify the
server certificate — so it protects against passive interception and not against
an active attacker inside the VNet. `verify-full` is the correct setting.

It is deliberately not changed here. Getting it wrong takes the API down with a
connection error, the right CA bundle depends on what Azure is currently serving,
and it cannot be tested anywhere except against the real server. The steps:

1. Confirm which root Azure Database for PostgreSQL presents in this region.
2. Bundle it into the API image, or confirm Node's built-in CA store already
   contains it.
3. Change `sslmode=require` to `sslmode=verify-full` in the Key Vault secret.
4. Deploy to **staging** and confirm the API connects before touching production.

The database is already on a private VNet with no public access, so this is
defence in depth rather than an open door.
