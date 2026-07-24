# JUMPSTART USA Operations Management Platform

One centralized application for the operations of a nationwide nonprofit prison
re-entry ministry: inside-prison programming, outside re-entry programming,
transitional housing, professional case management, volunteers & clearances,
alumni-to-mentor pathways, donors (Bloomerang mirror), employment, ministry
vehicles, communications, reporting, and public intake forms.

**Handoff package:** this repo plus the two documents in
[docs/requirements/](docs/requirements/) — the architecture plan (decisions and
rationale) and the AI Coding Prompt (authoritative field lists and acceptance
criteria).

## Architecture at a glance

- **`apps/web`** — React 18 + TypeScript SPA (Vite, Tailwind, TanStack
  Query/Table, React Hook Form + Zod). Role-based navigation; talks to the API
  as same-origin `/api`.
- **`apps/api`** — NestJS 11. Session-cookie auth (argon2id, TOTP 2FA for
  Admin/Executive, sessions in Postgres → instant revocation), RBAC guards on
  every endpoint, append-only audit logging on every mutation/login/export,
  public intake endpoints (Turnstile-verified, rate-limited) that feed staff
  review queues.
- **`packages/shared`** — the single source of truth for permissions (11 roles
  × module actions + field-level classes) and Zod validation schemas (business
  rules run identically in the browser and the API).
- **`packages/database`** — Prisma schema (person-centric model: one `persons`
  row, role profiles attached — a graduate becoming a mentor is a status
  change, never a duplicate record), migrations, seed.

## Run it locally

Prereqs: Node ≥ 20 with corepack (`corepack enable`), and **either** Docker
**or** nothing else (an embedded Postgres fallback is included).

```bash
pnpm install
cp .env.example .env                      # defaults work for local dev
cp packages/database/.env.example packages/database/.env

# Database — pick one:
docker compose up -d db                   # if you have Docker
pnpm --filter @jumpstart/database db:local  # no Docker: embedded Postgres (keep running)

pnpm db:migrate                           # apply migrations
pnpm db:seed                              # demo data (no real PII)

pnpm dev                                  # api on :3001, web on :5173
```

Sign in at <http://localhost:5173> — demo logins are printed by the seed
(admin: `admin@jumpstartusa.org` / `JumpstartDemo2026!`; one demo user per
role: `case_manager@jumpstartusa.org`, `volunteer_coordinator@…`, etc., same
password).

API reference (dev only): <http://localhost:3001/api/docs>.

Full Docker stack instead: `docker compose up` → web on
<http://localhost:8080>.

## Common commands

| Command | What it does |
|---|---|
| `pnpm dev` | API + web in watch mode |
| `pnpm build` | Build every package (topological) |
| `pnpm typecheck` / `pnpm test` | Typecheck / test all packages |
| `pnpm db:migrate` | `prisma migrate dev` against `DATABASE_URL` |
| `pnpm db:seed` | Idempotent demo seed |
| `pnpm db:reset` | Drop, re-migrate, re-seed (dev only) |

## Documentation

- [docs/architecture.md](docs/architecture.md) — system design and rationale
- [docs/database.md](docs/database.md) — data model conventions
- [docs/api.md](docs/api.md) — API conventions and endpoint map
- [docs/requirements/](docs/requirements/) — the authoritative requirements +
  architecture plan this system was built against

## Deployment (Render-class PaaS)

Two Docker images (`apps/api/Dockerfile`, `apps/web/Dockerfile`) + managed
Postgres 16 with daily backups & PITR. Release step: `prisma migrate deploy`.
Required env vars are enumerated in [.env.example](.env.example); generate
`SESSION_SECRET` with `openssl rand -hex 32`. Set `WEB_ORIGIN` to the public
web URL. See the architecture plan §3 for the hosting rationale and run-rate
budget.
