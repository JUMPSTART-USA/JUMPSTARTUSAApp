-- Least-privilege database roles for the JUMPSTART USA platform.
--
-- Run ONCE per environment, as the server administrator, against the
-- `jumpstart` database. Not a Prisma migration: Prisma migrations run as
-- whichever role the migrator uses, and this script is what CREATES that role.
--
-- Today the API, the migration job and the seed job all connect as
-- `jumpstart_admin`, the flexible-server administrator. Two consequences:
--
--  1. The audit log is described as append-only and has no update or delete
--     method on its service — but the role the API runs as can DELETE FROM
--     audit_logs, or drop the table. The tamper-evidence the design claims is
--     enforced only by the absence of code that exercises it.
--  2. Any SQL flaw that reaches the database arrives holding full DDL rights.
--
-- After this the API holds DML on the application tables and nothing else, and
-- cannot rewrite its own audit trail.
--
--   psql "$ADMIN_DATABASE_URL" \
--     -v app_password="'...'" -v migrator_password="'...'" \
--     -f least-privilege-roles.sql
--
-- Then point the API's DATABASE_URL at app_runtime and the migration job's at
-- app_migrator. Full runbook: docs/database-roles.md.

\set ON_ERROR_STOP on

BEGIN;

-- ── Roles ───────────────────────────────────────────────────────────────────
-- Idempotent: re-running rotates the passwords and re-applies the grants.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator LOGIN;
  END IF;
END
$$;

ALTER ROLE app_runtime  WITH PASSWORD :app_password;
ALTER ROLE app_migrator WITH PASSWORD :migrator_password;

-- The administrator joins app_migrator, and must, for two reasons. Ownership
-- of every table moves to app_migrator below; on Azure Database for PostgreSQL
-- the administrator is NOT a superuser (it is a member of azure_pg_admin), so
-- once it no longer owns a table it can no longer GRANT on it either. Without
-- this the grants further down fail the first time, and re-running the script
-- — which the runbook promises is safe — fails every time after.
GRANT app_migrator TO CURRENT_USER;

-- ── Schema access ───────────────────────────────────────────────────────────

GRANT CONNECT ON DATABASE jumpstart TO app_runtime, app_migrator;
GRANT USAGE   ON SCHEMA public      TO app_runtime;

-- The migrator owns the shape: it is the only role that may change it.
GRANT ALL ON SCHEMA public TO app_migrator;

-- ── Runtime: DML only, never DDL ────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- Tables created by FUTURE migrations have to land with the same grants, or
-- the next migration silently locks the API out of its own new table.
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- ── Append-only audit log ───────────────────────────────────────────────────
--
-- THE point of this script, and deliberately the LAST word on the matter: the
-- API may add audit rows and read them, and may not change or remove one.
-- "Append-only" stops being a property of the code and becomes a property of
-- the database — the only version of it that survives an attacker who reaches
-- the connection string.
--
-- Applied after the blanket grant above so ordering cannot surprise anyone.
-- Future tables are unaffected: this is a one-off on an existing table, not a
-- default privilege.
REVOKE UPDATE, DELETE ON audit_logs FROM app_runtime;

-- ── Ownership of what already exists ────────────────────────────────────────
--
-- LAST, deliberately: everything above is granted while the administrator
-- still owns these tables, so it never depends on the membership above having
-- taken effect mid-session.
--
-- GRANT is not enough, and the absence of this block breaks the NEXT release
-- rather than this one. Postgres requires OWNERSHIP for ALTER TABLE, CREATE
-- INDEX and DROP — no grant confers them. Every table here was created by
-- `prisma migrate` running as the administrator, so the administrator owns all
-- of them, and app_migrator could otherwise create brand-new tables and
-- nothing else. Verified against a real database: `ALTER TABLE audit_logs ADD
-- COLUMN` as app_migrator fails with "must be owner of table audit_logs", and
-- essentially every Prisma migration alters something that already exists.
--
-- Sequences and views move too, or ALTER on them hits the same wall.
-- app_runtime's grants survive an owner change — a grant lives on the object,
-- not on its owner — so the append-only REVOKE above still holds afterwards.
DO $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO app_migrator', obj.name);
  END LOOP;

  FOR obj IN
    SELECT sequencename AS name FROM pg_sequences WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO app_migrator', obj.name);
  END LOOP;

  FOR obj IN
    SELECT viewname AS name FROM pg_views WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO app_migrator', obj.name);
  END LOOP;
END
$$;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect exactly INSERT and SELECT — no UPDATE, no DELETE.
SELECT privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'app_runtime' AND table_name = 'audit_logs'
ORDER BY privilege_type;
