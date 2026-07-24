# JUMPSTART USA Operations Platform

## Architecture & Implementation Plan

**Prepared:** July 16, 2026
**Status:** Draft for leadership approval and development-team handoff
**Sources:** JUMPSTART USA AI Coding Prompt (authoritative requirements), JUMPSTART USA Project Prompt, and scoping answers from leadership (scale, budget, phasing, existing systems)

---

## 1. Executive Summary

**What we recommend building.** One web-based platform that runs Jumpstart USA's operations end to end: inside-prison classes, outside re-entry programming, transitional housing, professional case management, volunteers, employers and jobs, ministry vehicles, and — new in this plan — an alumni-to-mentor program and a public-facing layer (website, online giving, volunteer signup, and a "get help / refer someone" form) that feeds directly into the internal system. The participant is the center of the system: every class, home, job, service, note, and mentoring relationship hangs off one permanent participant record that follows the person from prison, through re-entry, into alumni life, and — if they choose — back into service as a mentor.

**What we recommend buying instead of building.** A resource-constrained nonprofit should never build what it can rent cheaply and safely. Specifically:

- **Online and recurring donations stay on Bloomerang**, which Jumpstart already pays for. Bloomerang handles credit cards, recurring gifts, and IRS tax receipts; the platform syncs every donor and gift into its own dashboards automatically. We do not build a payment system, and no card numbers ever touch our servers. (NeonCRM's data gets consolidated into Bloomerang; Apricot's case-management data migrates into the new platform, replacing Apricot.)
- **The marketing website runs on WordPress** (or a similar low-cost editable website tool), so staff can update pages without a developer. Its donate buttons point at Bloomerang; its volunteer and get-help forms submit into the new platform.
- **Criminal background checks run through a screening vendor** (e.g., Sterling Volunteers or Protect My Ministry); the platform tracks the results and expirations, not the raw reports.

Everything else — the participant record, programs, housing, case management, volunteers, mentors, employment, vehicles, reporting — is custom-built, because no off-the-shelf product models a prison re-entry ministry's actual operations in one place. That gap is exactly why Jumpstart currently juggles three systems.

**The technology.** We endorse the stack Jumpstart proposed (React + TypeScript, Node/NestJS, PostgreSQL, Prisma, Tailwind, Docker) with minor refinements. It is mainstream, proven, inexpensive to host, and easy to hire for — the right choice for a nonprofit that will maintain this system for a decade.

**What it costs and how long it takes** (details in §3.4 and §10):

| | Scope | Timeline | Estimated cost |
|---|---|---|---|
| **Phase 1** | Core platform: participants, institutions, inside/outside programs, housing, case management, volunteers, dashboards, reports — plus the public website, online giving, and public intake forms; migration from Apricot | Months 1–7 | **$60k–$90k** build |
| **Phase 2** | Employment, fleet, campaigns/events, communications center (email/SMS/mail), document uploads, expanded reporting | Months 8–11 | $30k–$45k |
| **Phase 3** | Alumni-to-mentor program workflows, longitudinal outcome & recidivism reporting, grant/board report pack | Months 12–15 | $25k–$40k |
| **Running costs** | Hosting, email/SMS, monitoring (excludes Bloomerang subscription you already pay) | ongoing | **$3k–$6k / year** |

The stated $75k budget covers Phase 1 — the part that replaces Apricot and stands up the public layer — with disciplined scope. Phases 2 and 3 need additional funding (~$55k–$85k combined) and are natural grant-funding candidates. If only $75k total ever materializes, the organization still ends Phase 1 with a working, complete core system, not half of everything.

**What leadership is approving:** (1) build the custom operations platform on the recommended stack; (2) consolidate NeonCRM into Bloomerang and keep Bloomerang as the giving system; (3) retire Apricot after migration; (4) launch the public website + giving + intake forms in Phase 1; (5) the phased budget above.

---

## 2. Assumptions

Collected here per the project brief; each is revisitable, and §11 lists the ones that carry real risk.

**Scale & operations**
1. Multi-state scale for years 1–3: roughly 15–50 institutions with inside classes, 10–30 transitional homes, 500–2,500 active participants at any time, growing toward national. The architecture leaves headroom to national scale (this is comfortably within a single PostgreSQL database's capacity for a decade).
2. Alumni volume: graduates accumulate at roughly 300–1,500/year at this scale; the alumni base reaches ~5,000–10,000 within 5 years. All sizing below assumes this.
3. Staff users: 25–100 concurrent internal users. This is a low-traffic line-of-business app, not a consumer product.
4. Participants are adults. Minors appear only as family members / emergency contacts, never as participants (see §7.4).
5. Jumpstart refers participants out for clinical treatment (substance abuse, mental health) rather than acting as a licensed treatment provider — so 42 CFR Part 2 does not directly apply to Jumpstart's records, though treatment-related notes are still treated as high-sensitivity (§7). **Verify with counsel** (§11).

**Budget, hosting & systems**
6. Lean budget: <$75k for Phase 1; 6–9 month initial timeline; small dev team (1–2 developers plus part-time design/PM), likely contract or AI-assisted senior development.
7. Standard US cloud hosting is acceptable; no state-DOC contract reviewed so far imposes on-premises or state-residency requirements. **Verify against each DOC data agreement** (§11).
8. Existing data lives in Bloomerang (donors/gifts), NeonCRM (donors/gifts), and Apricot by Bonterra (participants/case management). Bloomerang is retained; NeonCRM and Apricot are retired after migration (§8.3).
9. The current public website (if any) can be replaced or repointed; no legacy CMS content must be preserved programmatically.

**Policy**
10. Inside-facility connectivity is unreliable: inside program staff may not have internet access inside prisons. Data entry for inside classes happens after the fact from a laptop/tablet outside the secure perimeter; the UI is optimized for fast batch attendance entry, not live in-facility use.
11. Volunteer and mentor clearance requirements vary by state DOC and by facility. The system models clearance requirements per facility as data, not hard-coded rules (§6.6, §6.7).
12. Many state DOCs restrict or prohibit former offenders from entering facilities as volunteers. Alumni mentors are therefore assumed to serve primarily in *outside* programming; inside service requires facility-specific approval recorded in the system (§6.7).
13. Some participants (especially pre-release) are reachable only by postal mail. Electronic prison messaging systems (JPay, Securus, GTL) are out of scope for the platform; if used, staff log those contacts manually as case notes.
14. Recidivism reporting uses a working definition of *return to incarceration within 3 years of release*, with re-arrest and re-conviction tracked separately where known. Data is self-reported/staff-verified until DOC data agreements enable verification. The definition must be board-ratified before first grant use (§9.3, §11).
15. English-only UI at launch; the schema stores a preferred-language field for future localization.
16. Accounting (QuickBooks or similar) integration is out of scope for Phase 1–3; finance exports CSVs from Bloomerang and the platform.

---

## 3. Recommended Technology Stack

**Conclusion: endorse Jumpstart's preferred stack, with specific choices made and a few refinements.** It is the right stack for this organization — mainstream, proven, cheap to run, and the largest hiring pools in the industry. The refinements below remove ambiguity ("Express or NestJS" becomes NestJS) and fill gaps (hosting, auth, file storage) the requirements left open.

### 3.1 The stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React 18 + TypeScript**, built with Vite | SPA served as static assets; simple, fast, cheap to host |
| UI | **Tailwind CSS + shadcn/ui** | Free, accessible admin components (tables, dialogs, forms, badges, tabs) matching the required "clean admin dashboard" look without a paid UI kit |
| Data grid & state | **TanStack Query + TanStack Table** | Server-driven sorting/filtering/pagination on every list screen, as required |
| Forms & validation | **React Hook Form + Zod** | Zod schemas defined once in a shared package, used by both frontend forms and backend validation — one source of truth for every business rule ("if left early, require date + reason") |
| Charts | **Recharts** | Dashboard cards and report charts |
| Backend | **Node.js + NestJS** (choosing NestJS over Express) | NestJS's module/guard/decorator structure enforces consistent RBAC and layering — valuable when a small or rotating team maintains 15+ modules. It also auto-generates OpenAPI docs, which doubles as the API contract for the public website forms |
| ORM / DB | **Prisma + PostgreSQL 16** | Single relational database; migrations checked into the repo |
| Auth | **Session-based auth** (httpOnly secure cookies, argon2 password hashing, sessions stored in Postgres), TOTP two-factor required for Admin/Executive roles | Sessions beat JWTs for an internal staff app: instant revocation, no token-refresh complexity. Public endpoints are unauthenticated with rate limiting (§6.11) |
| Files | **S3-compatible object storage (Cloudflare R2)** | Document attachments (IDs, release paperwork, maintenance receipts); zero egress fees; server-generated signed URLs so files are never public |
| Repo structure | **pnpm monorepo**: `apps/web`, `apps/api`, `packages/shared` (Zod schemas, types, permission definitions), `packages/database` (Prisma) | Matches the structure sketched in the requirements |
| Deployment | **Docker images; hosted on Render** (or Railway/Fly.io — equivalent tier) with managed PostgreSQL incl. daily backups + point-in-time recovery | See hosting rationale below |
| Email | **Postmark** (or Amazon SES) | Transactional + program email |
| SMS | **Twilio** | Requires A2P 10DLC registration — start early, approval takes weeks (§6.12) |
| Monitoring | **Sentry** (errors, free tier) + host-platform logs/metrics + **UptimeRobot** | |
| Testing | Vitest (unit), Supertest (API integration), Playwright (a smoke-test suite over the critical flows) | |

### 3.2 Decisions and rationale

- **NestJS over Express** — Express is fine but unopinionated; with a lean, possibly changing team, NestJS's enforced structure is worth more than Express's flexibility. Guards give a single place to enforce role checks on every endpoint.
- **Sessions over JWT** — the requirements offered either. An internal app with instant-revocation needs (staff departures, lost devices) and no third-party API consumers has no use for JWTs' trade-offs.
- **Render-class PaaS over AWS** — AWS would save little and cost real ops time. A PaaS with managed Postgres, backups, TLS, and deploy-from-git keeps the ops burden near zero, which matters more than fine-grained control at this scale. Expect ~$100–$200/month total. Migration path off the PaaS is trivial because everything is Docker + vanilla Postgres.
- **Not Supabase/Firebase as the backend** — row-level-security policies for 11 roles across 30+ tables are harder to audit than NestJS guards, and the requirements' business rules live more naturally in a service layer.
- **Not a Next.js monolith** — viable alternative, but the SPA + API split keeps a clean, documented API boundary that the public website forms (and any future mobile app) consume, and it matches the team's stated preference.
- **WordPress for the marketing site, not a custom-coded site** — staff must edit program pages and post news without a developer. A custom React marketing site would consume budget forever. (Webflow/Framer are acceptable paid alternatives; the plan only requires that the site can embed Bloomerang forms and POST to the platform's public API.)

### 3.3 Ongoing cost estimate (excluding subscriptions Jumpstart already pays)

| Item | Est. monthly |
|---|---|
| Render: API + static web + managed Postgres (with backups) | $95–$175 |
| Cloudflare R2 storage + Turnstile (bot protection) | $0–$10 |
| Postmark email (~10–20k msgs/mo) | $15–$50 |
| Twilio SMS (~2–5k msgs/mo + number + 10DLC) | $30–$80 |
| Sentry / UptimeRobot | $0–$26 |
| WordPress managed hosting | $15–$30 |
| Background checks (per-check, volume-dependent) | ~$15–$35 per volunteer check |
| **Total platform run rate** | **~$250–$500/mo ($3k–$6k/yr)** |

### 3.4 Build effort estimate

Assumes a senior full-stack developer (AI-assisted) plus a part-time second developer/QA, at a blended $70–$100/hr contract rate typical for nonprofit work. Person-month ≈ 160 hrs.

| Phase | Effort | Cost at blended rate |
|---|---|---|
| Phase 1 (core + public layer + Apricot migration) | 7–9 person-months | $60k–$90k |
| Phase 2 (employment, fleet, events, communications) | 3.5–4.5 person-months | $30k–$45k |
| Phase 3 (alumni-to-mentor, outcomes reporting) | 3–4 person-months | $25k–$40k |

These are planning-grade ranges (±25%); firm numbers come from the chosen dev partner bidding against this document. §10 shows what's inside each phase and what to cut first if the budget forces it.

---

## 4. Architecture Overview

**Conclusion: one custom platform (SPA + API + PostgreSQL) at the center; a thin public layer (WordPress site + Bloomerang giving + public intake endpoints) feeding it; commodity services (email, SMS, background checks, storage) attached at the edges.** Everything the staff touches lives in one application with one database — the "one centralized application" goal — while payments, card data, and website content management are deliberately kept *outside* the platform's security boundary.

```
                        PUBLIC LAYER                                INTERNAL PLATFORM
┌─────────────────────────────────────────────┐      ┌──────────────────────────────────────────┐
│  WordPress marketing site                   │      │  React SPA (staff app)                   │
│  ├─ Program landing pages                   │      │  ├─ Dashboard, all modules, reports      │
│  ├─ Donate pages ──► Bloomerang hosted      │      │  └─ Role-based navigation                │
│  │                   giving forms (PCI)     │      │                  │ HTTPS (session auth)  │
│  ├─ Volunteer signup form ──────────────┐   │      │  NestJS API                              │
│  ├─ "Get help / refer someone" form ────┤   │      │  ├─ Auth & RBAC guards                   │
│  └─ Alumni update form (Ph.3) ──────────┤   │      │  ├─ Module services (business rules)     │
└──────────────────────────────────────── │ ──┘      │  ├─ Public intake endpoints (rate-       │
                                          │          │  │   limited, Turnstile-verified) ◄──────┼── forms POST here
                                          └─────────►│  ├─ Sync jobs (Bloomerang, bg checks)    │
                                                     │  └─ Audit logging on every mutation      │
   EXTERNAL SERVICES                                 │                  │                       │
   Bloomerang API  ◄──nightly + webhook sync────────►│  PostgreSQL 16 (single database)         │
   Background-check vendor ◄──order/status──────────►│  Cloudflare R2 (document files)          │
   Postmark (email) / Twilio (SMS) ◄──send──────────►└──────────────────────────────────────────┘
```

### 4.1 Key structural decisions

1. **Person-centric identity (§5).** A single `persons` table holds every human the ministry touches; role-specific profiles (participant, volunteer/mentor, staff) attach to it. This is what makes the alumni-to-mentor transition a status change instead of a duplicated contact, and it prevents the classic nonprofit-CRM disease of five records for one human.
2. **Intake queues, not direct writes.** Public forms never create operational records directly. They land in review queues (`volunteer_applications`, `referrals`) where staff deduplicate against existing persons and approve — protecting data quality from spam and typos (§6.11).
3. **Bloomerang stays the giving system of record.** The platform mirrors donors/donations read-mostly for dashboards and reporting; campaigns/events/vendors are managed in-platform. This eliminates the largest, riskiest build item (payments, PCI, receipting) from the budget (§6.8).
4. **RBAC in one place.** Permissions are defined centrally in `packages/shared` and enforced by NestJS guards on every endpoint; the SPA reads the same definitions to hide navigation. Row-level scoping (region/state) is designed in but activated later (§7.2).
5. **Everything auditable.** A single audit-log write path wraps all mutations: who, when, entity, record, old/new values, action — including logins, exports, and permission changes, per the requirements.
6. **Soft deletes + preserved history.** Enrollment-style records (housing, employment, class enrollments, mentor assignments) are append-only in practice: closing one and opening another is the norm; updates never overwrite history. This enshrines the "preserve housing and employment history" business rules at the schema level.

### 4.2 Environments & delivery

- `dev` (local, Docker Compose: Postgres + API + web), `staging`, `production`. Migrations run automatically on deploy to staging, manually gated to production.
- CI (GitHub Actions): typecheck, lint, unit + API tests, Playwright smoke on staging.
- Seed script generates realistic demo data (no real PII) per the requirements.
- Nightly logical backups to R2 in addition to the host's point-in-time recovery; quarterly restore drills (§7.6).

---

## 5. Foundational Data Model: One Person, Many Roles

**Conclusion: model people once, roles many times.** The requirements' `participants` and `volunteers` tables become *profiles* attached to a shared `persons` record. This is the single most important schema decision in the plan — it is what the alumni-to-mentor requirement demands ("a single person record with multiple roles over time, preserving their full participant history"), and it is nearly impossible to retrofit later.

```
persons
├─ id, first/middle/last name, preferred name, suffix
├─ date_of_birth, gender, preferred_language
├─ primary_phone, primary_email, mailing_address (+ address history table)
├─ communication_preferences (email_ok, sms_ok, sms_consent_at, mail_only, do_not_contact)
├─ deceased_at (nullable)
└─ audit fields (created/updated at/by, deleted_at)

participant_profiles (1:1 with persons, nullable)     volunteer_profiles (1:1 with persons, nullable)
├─ person_id (unique FK)                              ├─ person_id (unique FK)
├─ participant_number (human-readable ID)             ├─ status: applicant|active|inactive|suspended
├─ doc_numbers → participant_doc_ids table            ├─ is_mentor (bool) + mentor_status (§6.7)
│   (state, DOC id — one per state system)            ├─ background_check summary (latest, via §6.6)
├─ inside_status, outside_status, phase               ├─ training records → volunteer_trainings
├─ intake_date, release_date                          ├─ availability, roles, notes
├─ alumni_status: n/a|alumni|alumni_engaged           └─ audit fields
├─ graduation_date
├─ assigned_case_manager (FK users)                   staff link: users.person_id (nullable FK)
├─ emergency contacts → person_contacts table
└─ audit fields
```

**Rules of the model:**

- A person **may hold any combination** of profiles. A graduate who becomes a mentor has one `persons` row, one `participant_profiles` row (status: alumni), and one `volunteer_profiles` row (is_mentor: true). Their participant history — every class, home, job, note — remains attached and visible to authorized roles.
- **Nothing is ever re-keyed.** All operational tables (enrollments, notes, assignments) reference `participant_profiles.id` or `volunteer_profiles.id` (or `persons.id` for role-neutral things like communications), so adding a role never touches existing history.
- **Duplicate prevention:** on any person-creating flow (staff create, intake-queue approval), the API returns candidate matches (name + DOB + phone/email fuzzy match) before allowing creation. An admin-only **merge tool** (Phase 2) combines accidental duplicates and re-points child records, with a full audit trail.
- `person_contacts` holds emergency contacts and family members as structured rows (name, relationship, phone, is_minor flag) — supporting the minors-handling policy in §7.4 without making family members full person records.
- **Human-readable IDs**: participants get a `participant_number` (e.g., `P-2026-00341`) because staff, DOC chaplains, and paper forms need a speakable identifier that is not a database key.

Donors are *not* forced into this model in Phase 1 — donor records mirror Bloomerang (§6.8) and carry an optional `person_id` link used when a donor is also a volunteer/alumnus. This avoids entangling the Bloomerang sync with operational identity.

---

## 6. Module Specifications

Each module below follows the same pattern: **conclusion (incl. build-vs-buy) → data model sketch → core workflows**. Field lists already enumerated in the requirements document are incorporated by reference — the schemas below show keys, relationships, and *additions or changes*; the dev team should treat the requirements doc's field lists as the authoritative column inventory. Every table carries the standard audit fields (`id`, `created_at/by`, `updated_at/by`, `deleted_at`).

### 6.1 Participant Management (the central record)

**Conclusion: build. This is the heart of the platform and the primary reason off-the-shelf tools failed.** The participant profile page is the app's most important screen: tabs for Overview, Inside Classes, Outside Programs, Housing, Case Management, Employment, Services, Notes, Documents, Mentoring (added), and Activity History, exactly as the requirements specify.

**Data model:** `persons` + `participant_profiles` per §5, plus:

- `participant_status_history` — append-only log of phase/status transitions (status, effective_date, changed_by, reason). Dashboards and outcome reports read cohorts from this, not from the mutable current-status field.
- `participant_doc_ids` — (participant, state, doc_number, source, shared_under_agreement FK §7.5). One participant can have IDs in multiple state systems.
- `attachments` — polymorphic (entity_type, entity_id, file key in R2, filename, uploaded_by, sensitivity level). Serves the "documents placeholder" requirement everywhere, not just participants.

**Core workflows:**
1. **Create participant** (staff): duplicate check (§5) → create person + participant profile → optional immediate inside-class enrollment or referral-queue origin (§6.11).
2. **Pre-release → post-release transition:** participant completes inside programming; on release, staff record `release_date`, outside intake begins (§6.5 onboarding checklist auto-instantiates).
3. **Graduation:** staff mark program completion → status becomes `alumni`, `graduation_date` set → alumni engagement track begins (§6.7). Validation: graduation requires completion assessments on active enrollments or explicit staff override with reason (audit-logged).
4. **Timeline view:** a unioned activity feed (enrollments, notes, services, employment, housing moves, communications) ordered by date — the requirements' "Activity History" tab.

### 6.2 Inside Prison Programming

**Conclusion: build.** Institutions, inside classes, enrollments, and Blue/Green/Yellow/Red assessments per the requirements' field lists, verbatim.

**Data model:** `institutions` (fields per requirements; plus `state` is indexed — it drives regional filtering everywhere; plus `volunteer_requirements` relation, §6.6), `inside_classes` (FK institution; status: planned/active/completed/canceled), `inside_class_enrollments` (FK participant, FK class; completion_status enum per requirements; final_assessment enum Blue/Green/Yellow/Red; left_early_date, left_early_reason, completion_date), `inside_class_sessions` + `attendance` (optional Phase 2 — per-session attendance; Phase 1 tracks enrollment-level status only).

**Business rules (enforced in shared Zod schemas, so both form and API reject violations):**
- `completion_status = left_early` ⇒ `left_early_date` AND `left_early_reason` required.
- `completion_status = completed` ⇒ `final_assessment` required (Blue/Green/Yellow/Red) — the requirements say "allow or require"; this plan chooses **require**, with an `assessment_pending` interim status so a class can be closed before all assessments are in.
- End date ≥ start date, everywhere.

**Core workflows:** create/manage institutions (with chaplain + primary contact); schedule a class; batch-enroll participants (roster picker, since classes enroll 10–30 people at once); close out a class (walk the roster: completed-with-assessment / left-early-with-reason / transferred); institution profile page shows classes held, participants served, volunteers assigned, per requirements. Batch entry matters: per assumption #10, staff enter data after leaving the facility — the close-out screen is a single-page roster grid, not one form per participant.

### 6.3 Outside Re-Entry Programming

**Conclusion: build.** Same enrollment pattern as inside classes, generalized: outside programs have a `program_type` (transitional housing*, treatment, life skills, soft skills, Bible study, mentoring, transportation, employment assistance, case management), recurring schedules, capacity, staff and volunteer leads.

**Data model:** `outside_programs`, `outside_program_enrollments` — fields per requirements. Same left-early and completion-assessment rules as §6.2. (*Transitional housing has its own richer module, §6.4; a housing enrollment may optionally link to an umbrella outside-program enrollment for reporting.)

**Core workflows:** program CRUD with schedule; enroll/complete/exit participants; attendance (Phase 2, same session model as inside classes); program roster and completion reports.

### 6.4 Transitional Housing

**Conclusion: build.** `transitional_homes` and `housing_enrollments` per the requirements' field lists.

**Business rules:** multiple sequential (even overlapping-by-transfer) enrollments per participant are normal and preserved forever; **moved-out requires move-out date and reason**; capacity warnings (not hard blocks — real life overrides software) when a home's active enrollments exceed capacity.

**Core workflows:** home CRUD; move-in (with duplicate-active-enrollment warning); transfer (atomically closes one enrollment with reason `transferred` and opens the next — one action, two records, preserving history); move-out with reason + completion assessment; occupancy dashboard (beds used/capacity per home, current residents); exit/completion report.

### 6.5 Case Management

**Conclusion: build — this is the module that replaces Apricot,** and its confidentiality model is a primary custom requirement (§7.3).

**Data model** (fields per requirements, with structure decisions):
- `onboarding_checklists` + `onboarding_checklist_items` — instantiated from a configurable template (admin-editable item list, so the ministry can evolve the checklist without a developer); items per the requirements' examples (intake form, identity documents, release paperwork, needs assessments, case manager assigned, service plan created…), each with status, completed_at/by, notes.
- `case_notes` — participant, case manager, note date, contact type, category, content, follow_up_required + follow_up_date, **confidential flag** (access model in §7.3).
- `case_services` — service records per requirements (type, date, provider, description, outcome, follow-up).
- `service_plans` + `goals` + `goal_milestones` — plan per participant with goals (category, target date, status) and milestones.
- `tasks` — assigned-to staff, due date, linked to participant/goal/referral; feeds each case manager's "my follow-ups" queue.
- `referrals` (outbound) — participant, referred-to provider (FK `vendors`/partner orgs), reason, date, outcome.
- `needs_assessments` — structured risk/needs instrument results (instrument name, date, domain scores, summary), versioned per administration.

**Core workflows:** post-release intake (checklist auto-created; §6.11 referral approvals land here); daily case-noting (fast entry: last-used category/contact-type defaults, keyboard-first); follow-up queue (today/overdue tasks and note follow-ups per case manager — this is the case manager's home screen); service plan reviews; caseload dashboard for supervisors (notes per week, overdue follow-ups, participants with no contact in N days).

### 6.6 Volunteer Management, Screening & Clearances

**Conclusion: build the tracking; buy the background checks.** The platform is the system of record for volunteer status, training, assignments, and per-facility clearances; a screening vendor (Sterling Volunteers, Protect My Ministry, or Checkr — selection in §8.2) runs the actual checks.

**Data model:** `volunteer_profiles` (§5) plus:
- `volunteer_assignments` — per requirements (assignment_type: inside class/outside class/Bible study/event/transportation/mentoring/administration/other; FKs to institution/program/event; role, dates, status).
- `background_checks` — person, vendor, package, ordered_at, completed_at, **adjudication result only** (clear / review / not-cleared) + expiry. The raw report stays at the vendor; the platform stores the decision, never the criminal-history detail (§7).
- `volunteer_trainings` — person, training type (orientation, PREA awareness, facility-specific, mentor training §6.7), completed_at, expires_at, evidence attachment.
- `facility_clearance_requirements` — **per-institution requirement list as data** (e.g., "DOC volunteer application", "PREA training", "TB test", "warden approval", "background check ≤ 2 yrs"), each with renewal period. Admins maintain these per facility because every DOC differs (assumption #11).
- `volunteer_clearances` — person × institution × requirement: status, issued_at, expires_at, document attachment. A volunteer's **facility eligibility is computed**: eligible at institution X iff every active requirement of X is satisfied and unexpired.

**PREA awareness:** the Prison Rape Elimination Act requires facilities to screen and train anyone with participant contact. The platform treats PREA training as a first-class clearance requirement type, blocks (soft-block with override + reason, hard-block configurable per facility) assignment of un-cleared volunteers to inside assignments, and reports upcoming clearance expirations on the volunteer coordinator's dashboard.

**Core workflows:** public application → review queue → approve into volunteer profile (§6.11); order background check (deep-link/API to vendor, result recorded); track trainings; assign to classes/programs/events with clearance validation; expiration dashboard (checks, trainings, clearances lapsing in 30/60/90 days); volunteer service history report (where, when, role — per requirements).

### 6.7 Alumni-to-Mentor Program (new scope)

**Conclusion: build — it's a thin, high-value layer on the person model and volunteer module, not a separate product.** Because §5 makes a mentor just a volunteer profile on a person who already has participant history, this module is mostly *workflow and reporting*, which is why it fits in Phase 3 without schema risk: **all tables below ship in Phase 1's schema; Phase 3 turns on the workflows.**

**Data model:**
- `alumni_engagements` — person, engagement type (event attendance, check-in call, newsletter, volunteer service, gave testimony, donated), date, notes. The alumni activity feed.
- `outcome_checkins` — person, checkin due/completed dates, wave (30d / 6mo / 12mo / 24mo / 36mo post-graduation), employment status, housing status, program-defined wellbeing fields, justice-status fields (§9.3), collected_by, method (call/SMS/mail/event/self-report). Auto-scheduled on graduation; feeds recidivism/outcome reporting.
- `mentor_screenings` — person, stage (applied → interview → background check → references → mentor training → panel approval), stage outcomes, approved_at/by, conditions (e.g., "outside programs only"). **Alumni-aware:** the screening record links to the person's participant history; policy fields capture time-since-release and facility restrictions rather than hiding them. Screening criteria for alumni (e.g., ≥ 12 months post-graduation, case-manager endorsement) are configurable checklist items, like §6.5's onboarding template.
- `mentor_assignments` — mentor person × participant, matched_by, start/end dates, status (proposed / active / paused / ended), end reason, match rationale (proximity, shared background, program), meeting cadence expectation.
- `mentor_session_logs` — assignment, date, mode (in person/phone/video), duration, structured flags (participant progress, concerns escalated), notes (confidentiality per §7.3).

**Core workflows:**
1. **Graduation → alumni:** automatic on §6.1's graduation workflow — alumni status set, outcome check-ins auto-scheduled, welcome-to-alumni communication queued (§6.12), invitation to alumni track.
2. **Alumni engagement:** staff log engagements; alumni events run through the events module (§6.8) with alumni-filtered invitations; a lightweight **alumni update form** (public layer, tokenized link — no login) lets alumni self-report job/housing/contact changes into a review queue.
3. **Alumni → mentor pathway:** interested alumnus flagged → mentor screening pipeline (stage-tracked like a kanban) → on approval, `volunteer_profiles.is_mentor = true` with any restrictions recorded → mentor training (§6.6 training type).
4. **Matching & assignment:** coordinator views open mentee requests beside available mentors (filters: state/city, availability, background, capacity — default max 2 active mentees per mentor, configurable) → proposes match → case manager approves (case manager owns the participant relationship) → assignment active; sessions logged; either party can pause/end with reason.
5. **Oversight:** mentoring dashboard — active matches, matches with no session logged in 30 days, screenings in pipeline, alumni engagement rates, outcomes of mentored vs. non-mentored participants (§9.3).

**Access boundary that matters:** mentors are *not* platform users in Phases 1–3. They interact via their coordinator, communications (§6.12), and the tokenized alumni form. A mentor never sees another participant's record — the mentee's case file remains staff-only. (A scoped mentor portal is a Phase 4+ option, listed in §11.)

### 6.8 Donor, Vendor, Campaign & Event CRM + Online Giving

**Conclusion: buy the giving, build the rest.** Keep **Bloomerang** as the donor/giving system of record (already licensed, staff-known): it provides hosted donation forms, recurring gifts, card-on-file management, PCI compliance (SAQ-A — card data never touches Jumpstart systems), and automated IRS-compliant tax receipts. Consolidate **NeonCRM into Bloomerang** (one-time migration, §8.3). The platform **mirrors** donors and donations via the Bloomerang REST API for dashboards and cross-module reporting, and **builds** what Bloomerang doesn't do well for this ministry: vendors, event operations, and campaign views joined to program outcomes ("this campaign funded 3 homes housing 41 participants").

**Data model:**
- `donors` — mirror of Bloomerang constituents (bloomerang_id unique, donor_type, name, contact fields, status) + `person_id` nullable link (§5) + local notes. Read-mostly; edits happen in Bloomerang and sync back.
- `donations` — mirror (bloomerang_id, donor, date, amount, method, fund/designation, recurring flag, receipt status) + local links: `campaign_id`, `event_id` (mapped from Bloomerang campaign/appeal fields).
- `campaigns` — per requirements (goal, raised-to-date computed from mirrored donations, dates, status).
- `events` — per requirements (type, date, location, campaign FK, attendance, revenue, expenses) + `event_registrations` (person or external name/email; supports alumni events §6.7 and volunteer appreciation).
- `vendors` — per requirements; doubles as the referral-partner directory for §6.5 referrals and the fleet module's service vendors (§6.10).

**Sync design:** nightly full-delta sync + a manual "sync now"; Bloomerang webhooks (where available) for near-real-time gift visibility. Conflict rule: Bloomerang wins on donor/donation fields it owns; the platform owns links to campaigns/events/persons. Sync failures alert admins; a reconciliation report compares monthly totals (platform vs. Bloomerang) so finance can trust the dashboards.

**Core workflows:** online gift → Bloomerang processes + receipts → sync → appears in platform dashboards/campaign progress. Event lifecycle: create (optionally under a campaign) → registrations → check-in list → record attendance/revenue/expenses → event financial summary report. Vendor CRUD. CRM reporting per requirements (totals by range/campaign/donor, donor history, campaign progress) runs on the mirrored data.

**Trade-off stated plainly:** development staff work in two systems (Bloomerang for gift entry/receipting/donor communications; the platform for events, vendors, campaign-to-program reporting). That is the price of removing payments/receipting (the single most expensive, compliance-heavy build item) from a <$75k budget. A Phase 4 option to bring donor management fully in-platform stays open — the mirror tables are already the schema you'd migrate into.

### 6.9 Employer & Employment Tracking

**Conclusion: build.** Straightforward module per the requirements' field lists: `employers` and `participant_employments` (job title, dates, status enum applied→…→resigned, pay rate, hours, supervisor).

**Business rules:** multiple employers per participant over time; **history preserved, never overwritten** — a job change is a new record, status changes append to `employment_status_history` (mirrors §6.1's pattern). Pay rate/hours are sensitive fields (§7.2 field-level access).

**Core workflows:** employer CRUD with hiring-status pipeline (prospect → partner → actively hiring → paused); record placements and status changes; employment coordinator dashboard (participants seeking work, recent placements, 90-day retention checkpoints — auto-task at 30/60/90 days per placement feeding §6.5 tasks); employer profile with participants employed and outcomes per requirements; employment history and employer participation reports.

### 6.10 Ministry Vehicles & Maintenance

**Conclusion: build (small).** `vehicles` and `vehicle_maintenance_records` per the requirements' field lists, with maintenance vendor as FK to `vendors` (§6.8) and receipt attachments via `attachments` (§6.1).

**Core workflows:** vehicle CRUD; log maintenance (mileage at service, cost, next-due date/mileage); alerts surface on dashboard and fleet screen: maintenance due (by date or mileage), registration/insurance expiring ≤ 30/60 days, per requirements. Trip/usage logging is explicitly out of scope until asked (kept simple deliberately). Maintenance cost reports per vehicle/period.

### 6.11 Public-Facing Layer (new scope)

**Conclusion: buy the website, build the intake pipeline.** WordPress marketing site (staff-editable) + Bloomerang hosted giving + three custom public endpoints on the platform API. The public layer is intentionally thin: its whole job is conversion paths that feed internal modules.

**Components:**
1. **Marketing site (WordPress, managed hosting)** — home, about, program landing pages (inside program, re-entry/housing, employment, mentoring/alumni), stories, contact. Program pages are edited by staff; a shared design kit (logo, colors, Tailwind-exported styles) keeps the platform's public forms visually consistent with the site.
2. **Donate (Bloomerang hosted forms)** — one-time + recurring; campaign-specific forms embedded on landing pages; receipts automatic (§6.8). No card data on Jumpstart infrastructure — this is the PCI strategy.
3. **Volunteer signup (platform public form)** — `POST /public/volunteer-applications`: interest areas, availability, location, church affiliation, consent language. Lands in `volunteer_applications` queue.
4. **Get help / refer someone (platform public form)** — `POST /public/referrals`: who is referring (self / family / chaplain / agency), the person needing help, facility & expected release date if inside, needs. Lands in `referrals_inbox` queue. The form warns against including sensitive detail; it is the front door, not the case file.
5. **Alumni update form (Phase 3)** — tokenized link (§6.7), no login.

**Intake pipeline (the architectural core of this section):** every public submission → Cloudflare Turnstile bot check + rate limiting + strict Zod validation → an **intake queue record**, never a live operational record. Staff review queues show duplicate-person candidates (§5), and approval creates/links the person + profile and kicks off the right workflow (volunteer screening §6.6, or intake/onboarding §6.5). Rejections keep an audit trail. Queue SLAs surface on dashboards ("referrals waiting > 3 days").

**Privacy note for the referral form:** submissions contain third-party PII about justice-involved people. The queue is restricted to case-management + admin roles, retained per §7.6's schedule, and excluded from exports.

### 6.12 Communications (email, SMS, physical mail) (new scope)

**Conclusion: build a thin communications center over Postmark + Twilio; handle physical mail as generated letter batches.** Some participants are reachable *only* by mail (assumption #13), so mail is a first-class channel, not an afterthought.

**Data model:** `communication_templates` (channel, subject/body with merge fields, owner); `communications` — person, channel (email/SMS/letter), template or ad-hoc, status (queued/sent/delivered/failed/returned), related entity (event, check-in, mentoring), sent_by; `communication_batches` — a send to a filtered audience (e.g., "alumni in TN", "volunteers with expiring clearances"); per-person preferences and consent live on `persons` (§5).

**Channel specifics:**
- **Email (Postmark):** transactional (receipts of application, event confirmations) + program email. Bounce/complaint webhooks update person records.
- **SMS (Twilio):** appointment/event reminders, check-in nudges. **Explicit opt-in recorded with timestamp (TCPA);** STOP handling automatic; A2P 10DLC brand/campaign registration is a Phase 2 prerequisite started early (§10). No confidential content by SMS — templates enforced.
- **Physical mail:** a **letter batch generator** — pick a template + audience → platform renders merged PDFs (letters + envelope/label sheet) → staff print and mail → batch marked sent, each letter logged on the person's timeline. Returned mail is logged, flagging the address as bad. A print-and-mail API (Lob) is a drop-in upgrade later; at this scale, in-house printing is cheaper.
- **Fundraising email stays in Bloomerang** (it has donor email built in) to avoid two systems both mass-emailing donors. Rule of thumb: donors → Bloomerang; participants/alumni/volunteers/mentors → platform.

**Core workflows:** send one-off from any person record; batch sends with audience filters; automated triggers (graduation welcome §6.7, check-in reminders, clearance expirations §6.6); full communication history on each person's timeline; suppression honored everywhere (do_not_contact, mail_only).

### 6.13 Dashboard

**Conclusion: build; it's a read layer, not a module.** Role-based widget grid per the requirements' metric list (active classes/programs/participants, housing occupancy, completions vs. early exits, volunteers, donors + donation totals from mirrored data, campaigns, upcoming events, employers, vehicles + maintenance alerts, recent case activity) with global filters (date range, state/region, institution, program type, participant status).

**Implementation:** each widget = one parameterized SQL view/query exposed via `/api/dashboard`, cached ~5 minutes; widget visibility keyed to permissions (executives see org-wide; a case manager sees their caseload). Alerts (vehicles, clearances, overdue follow-ups, intake-queue SLAs) share one "attention needed" pattern. Acceptance criterion #19 ("dashboard metrics accurately summarize the database") is a test target: seed data + widget assertions in CI.

### 6.14 Users, Roles & Administration

**Conclusion: build (standard).** `users` (login identity, FK person_id optional, status, TOTP secret, last_login), `roles`, `permissions`, `role_permissions`, `user_roles` — the requirements' 11 roles (Admin, Executive, Inside Program Staff, Outside Program Staff, Case Manager, Housing Staff, Volunteer Coordinator, Development Staff, Employment Coordinator, Fleet Manager, Read Only) ship as seeded roles over a permission matrix (module × create/read/update/delete/export + special permissions like `case_notes.confidential.read`, `person.merge`, `admin.roles`). Roles are additive; a user can hold several.

**Admin workflows:** user lifecycle (invite → set password → deactivate on departure — sessions revoked instantly per §3.2); role assignment; template administration (onboarding checklist §6.5, screening stages §6.7, facility requirements §6.6, communication templates §6.12); audit-log viewer with filters (user, entity, date, action) per requirements; system settings (org info, states/regions list, enum value management where safely configurable).

---

## 7. Cross-Cutting Security, Privacy & Compliance

**Conclusion: the platform holds data about justice-involved people, their families, and their faith journey — treat all participant data as sensitive by default, add explicit extra walls around confidential notes and justice history, and keep DOC-sourced data traceable to its data-sharing agreement.** This section is deliberately specific to this population; a generic OWASP checklist is necessary but not sufficient.

### 7.1 Baseline application security (per requirements, made concrete)

- Argon2id password hashing; TOTP 2FA mandatory for Admin/Executive, available to all; session cookies httpOnly/Secure/SameSite=Lax; idle timeout 30 min, absolute 12 h.
- Server-side authorization on every endpoint via NestJS guards (permission checks never trust the SPA); Zod validation on every input; Prisma parameterization (SQLi), standard headers/CSP (XSS), CSRF tokens on state-changing routes, rate limiting globally and aggressively on `/public/*` and auth routes.
- TLS everywhere; encryption at rest for Postgres and R2 (host-provided); secrets in the host's secret manager, never in the repo.
- Audit logging per requirements: every create/update/delete/login/export/permission-change with old/new values (§4.1.5). Audit rows are append-only; no delete permission exists.
- Dependency scanning (Dependabot) + an annual third-party penetration test once real data is live (~$5–10k, budget it — first one before Phase 1 go-live if funds allow, §11).

### 7.2 Authorization model: three layers

1. **Role/permission (RBAC)** — §6.14's matrix; what modules and actions.
2. **Row scoping** — schema carries `state`/region on institutions, homes, programs; a `user_region_scopes` table exists from day one but enforcement activates when the org grows enough to need it (multi-state staff separation). Case managers additionally get "my caseload" default views.
3. **Field-level sensitivity** — a small set of field classes gated by permission, not role-hardcoded: justice history (DOC numbers, offense-related fields), pay rate/hours, background-check adjudications, confidential notes (§7.3). Exports respect the same classes — a user who cannot see a field cannot export it.

### 7.3 Confidential case notes (explicit model)

A case note with `confidential = true` is readable **only** by: its author, the participant's currently assigned case manager, and holders of `case_notes.confidential.read` (intended: case-management supervisors, Admin). Not Executives, not Read Only — dashboards and reports show *counts* of notes, never confidential content. Confidential notes are excluded from all exports and from the participant timeline for unauthorized viewers (which shows "a confidential note exists" as a dated stub, so the record's completeness is visible without the content). Access to confidential notes is itself audit-logged (read logging on this class only — full read-logging everywhere would be noise).

### 7.4 Population-specific privacy rules

- **Justice-involved data minimization:** store what operations need (DOC ID, facility, release date, program-relevant flags) — not full rap sheets. Background-check detail stays at the screening vendor (§6.6); the platform stores adjudication outcomes only.
- **Minors:** children appear only inside `person_contacts` (family/emergency contacts) with an `is_minor` flag, minimal fields (name, relationship, phone of guardian), never as standalone person records, never in communications audiences, never in exports.
- **Alumni dignity:** alumni control their story — `persons.do_not_contact` and a `testimony_consent` flag (person, scope, date, revocable) gate any use of a graduate's name/story in development/marketing contexts. Mentor records never expose a mentor's participant history to anyone outside case-management/admin roles — a volunteer coordinator sees that an alumni mentor is cleared and trained, not their program file (§6.7's boundary, enforced as field-level class per §7.2).
- **Faith-related data** (Bible study participation, spiritual-support notes) is ordinary program data internally but is excluded from any future external data sharing by default.

### 7.5 DOC data-sharing constraints

`data_sharing_agreements` table: state/agency, effective + expiry dates, permitted uses, re-disclosure restrictions, required safeguards, attachment of the signed agreement. DOC-sourced fields (`participant_doc_ids`, release dates where DOC-provided) carry `source = 'doc'` and link to the agreement. Rules: DOC-sourced data is never exposed on public surfaces or included in exports lacking the export permission; agreement expirations alert admins; if an agreement requires purge-on-termination, the linkage makes the purge executable and provable. This turns "we comply with our DOC agreements" from a hope into a query.

### 7.6 Retention, backups, continuity

- **Retention schedule (board-ratified, §11):** participant records retained long-term by default (longitudinal outcomes require it — this *is* the alumni mission) with a documented right-to-restrict process; rejected intake-queue submissions purged after 12 months; audit logs 7 years; backups 35 days rolling + monthly archives 24 months.
- Host point-in-time recovery + independent nightly logical dumps to R2 (different failure domain); quarterly restore drill with a written runbook; RPO ≤ 24h, RTO ≤ 8h documented for leadership.
- Departing-staff checklist: deactivate user (kills sessions), reassign caseload, transfer follow-ups — one admin screen (§6.14).

## 8. Integration Map & Data Migration

**Conclusion: five external integrations, all commodity, none on the critical path of daily operations** — if any integration is down, staff keep working and data reconciles later.

### 8.1 Integration map

| System | Direction | Mechanism | Purpose | Failure mode |
|---|---|---|---|---|
| **Bloomerang** | pull (+ webhooks) | REST API, nightly delta + on-demand | Donor/donation mirror for dashboards & campaign reporting (§6.8) | Dashboards show last-synced timestamp; ops unaffected |
| **Background-check vendor** (§8.2) | push order / pull result | Vendor API or coordinator-managed flow + manual result entry (Phase 1 may start manual) | Volunteer & mentor screening (§6.6) | Coordinator enters results manually |
| **Postmark** | push + webhooks | API | Email + bounce/complaint handling (§6.12) | Queue retries; comms marked failed |
| **Twilio** | push + webhooks | API | SMS + delivery status + STOP handling (§6.12) | Same |
| **WordPress site** | inbound only | Site forms POST to `/public/*` endpoints (Turnstile-verified) | Volunteer applications, referrals (§6.11) | Form shows retry message; nothing lost server-side once accepted |
| **Cloudflare R2** | internal | S3 API, signed URLs | Attachments (§6.1) | Uploads fail gracefully; records save without attachment |

Explicitly *not* integrated: payment processors (Bloomerang owns payments), accounting (CSV export until a future phase), DOC systems (no state offers a usable API; DOC data arrives as documents/spreadsheets and is entered/imported with source tagging per §7.5).

### 8.2 Vendor selections to finalize (recommendations)

- **Background checks: Sterling Volunteers** (volunteer-sector pricing, adjudication workflow, API) — Protect My Ministry is the ministry-sector alternative; Checkr is the API-first generalist. Decision criteria: per-check price at expected volume, per-state coverage, API for status pull. This is a swappable edge — don't let vendor choice block Phase 1 (manual entry works).
- **Consolidation target: Bloomerang over NeonCRM** — Jumpstart already uses both; Bloomerang's retention-focused feature set and simpler staff UX fit a lean shop. If leadership prefers NeonCRM after a feature/price review, the architecture is identical — swap the sync adapter.

### 8.3 Data migration plan (one-time, Phase 1)

| Source | Data | Destination | Approach |
|---|---|---|---|
| **Apricot (Bonterra)** | Participants, enrollments, case notes, services, assessments | Platform | Bonterra CSV/report exports → staged import tables → field mapping workshop with case-management staff → scripted import with validation report → staff spot-check 5% sample → cutover. Apricot kept read-only 6 months, then retired |
| **NeonCRM** | Donors, donations, campaigns | **Bloomerang** | Use Bloomerang's migration tooling/services; dedupe during import (email+name match); platform then mirrors the consolidated Bloomerang |
| **Bloomerang** | Donors, donations | Platform (mirror) | Initial full sync via §6.8's sync job — no manual migration |
| **Spreadsheets/Word** (volunteers, institutions, homes, vehicles…) | Whatever staff have | Platform | Import templates (CSV) per entity with validation + dedup preview; staff clean data in the template, not in the database |

**Migration rules:** every imported record tagged `source` + `imported_at` + original ID (traceability and re-runs); imports are idempotent (re-running updates, never duplicates); person dedup runs across *all* sources (an Apricot participant who is also a NeonCRM donor becomes one person with a donor link); migration happens in staging first, sign-off by module owners, then production cutover during a planned quiet week. Budget reality: migration is inside Phase 1's estimate but is the most commonly underestimated item — the field-mapping workshop happens in month 1, not month 5 (§11).

---

## 9. Reporting & Exports

**Conclusion: build reporting as SQL views + a thin export layer, not a BI tool.** Every report in the requirements' list maps to a filterable, exportable view; outcome/recidivism reporting (new scope) is a cohort layer on top of the same data.

### 9.1 Mechanics

- Each report = a versioned SQL view/parameterized query + a list screen with the standard filter set (date range, state/region, institution, program, status, staff, campaign, participant — per requirements) and column-level permission filtering (§7.2).
- **Exports: CSV and Excel (.xlsx) for every report; PDF for the board/grant pack** (§9.3) and rosters — server-rendered (headless Chromium print pipeline), consistent header/footer with generated-at timestamp and filter echo. Every export writes an audit row (who exported what, with which filters — requirement §736 and a real safeguard for this population).
- The full requirements report list (participant status, class rosters/completions/assessments, institution activity, program enrollment, housing occupancy/exit, case activity, volunteer assignment/training, donor/campaign/event financials, employer participation, employment history, vehicle maintenance) ships across Phases 1–2 per §10's cut lines.

### 9.2 Dashboards vs. reports

Dashboards (§6.13) answer "how are we doing right now"; reports answer "give me the defensible artifact." Both read the same views — no second source of truth.

### 9.3 Outcome & recidivism reporting (new scope)

- **Cohort engine:** graduates grouped by graduation quarter/year; every outcome metric is reported per cohort with explicit denominators ("of the 214 participants who graduated in 2026, at 12 months: 71% employed, 84% in stable housing, 9% reincarcerated, 12% lost to follow-up"). *Lost to follow-up is always shown* — hiding it is how outcome reporting loses credibility with sophisticated funders.
- **Data source:** `outcome_checkins` (§6.7) waves at 30d/6/12/24/36 months, fed by staff check-ins, alumni self-report (tokenized form), and mentoring session flags; justice-status fields record re-arrest / re-conviction / re-incarceration separately, each with a verification level (self-reported / staff-verified / DOC-verified).
- **Recidivism definition** printed on every report that uses it (assumption #14; board-ratifies, §11): headline = return to incarceration within 3 years of release; supplementary 1-year and re-arrest views.
- **Board/grant report pack (Phase 3):** one-click PDF per period — program throughput (enrollments, completions, Blue/Green/Yellow/Red distribution), housing outcomes, employment placements & 90-day retention, cohort outcomes incl. recidivism, alumni engagement (active alumni, event attendance, check-in completion), mentoring outcomes (active matches, session cadence, mentored-vs-non-mentored cohort comparison — reported as descriptive, not causal), and development summary from mirrored Bloomerang data.

---

## 10. Phased Rollout, Timeline & Effort

**Conclusion: three phases over ~15 months; Phase 1 (months 1–7) delivers a complete, usable core plus the public layer and retires Apricot.** Each phase ends with software in production use, not a demo. Effort/cost per phase in §3.4.

### Phase 1 — Core platform + public layer (months 1–7, ~7–9 person-months)

| Month | Milestones |
|---|---|
| 1 | Foundations: monorepo, CI/CD, environments, auth/RBAC, person model, audit logging, seed data. **In parallel:** Apricot field-mapping workshop; NeonCRM→Bloomerang consolidation kickoff; Twilio 10DLC registration; background-check vendor selection |
| 2–3 | Participants (profile + timeline), institutions, inside classes + enrollments + assessments; housing module; import templates |
| 4–5 | Outside programs; case management (checklist, notes w/ confidentiality, services, plans/goals/tasks); volunteers (profiles, assignments, checks/trainings/clearances — manual check entry acceptable) |
| 5–6 | Dashboard, Phase-1 reports (participant status, rosters, completions/assessments, occupancy, case activity, volunteer) + CSV/Excel exports; Bloomerang mirror sync + donor/donation dashboards; public layer: WordPress site, Bloomerang giving embedded, volunteer + referral forms → intake queues |
| 6–7 | Apricot migration to staging → validation → production cutover; staff training (role-based sessions + quick-reference guides); go-live; hypercare (2 wks); Apricot read-only |

**Cut lines if budget forces (in order):** per-session attendance (already Phase 2) → service plans/goals (keep notes+checklist+tasks) → WordPress build handled by a volunteer/separate mini-contract → PDF exports (CSV/Excel only). **Do not cut:** person model, audit logging, confidentiality model, intake queues, migration.

### Phase 2 — Operational completeness (months 8–11, ~3.5–4.5 person-months)

Employment module; fleet module; campaigns/events/vendors in-platform; communications center (email/SMS/letter batches — 10DLC done in Phase 1); document uploads everywhere; per-session attendance; person-merge tool; remaining requirements reports + PDF export; row-level region scoping if multi-state staffing needs it by then.

### Phase 3 — Alumni-to-mentor + outcomes (months 12–15, ~3–4 person-months)

Alumni engagement workflows + tokenized update form; outcome check-in scheduling and capture; mentor screening pipeline, matching, assignments, session logs, mentoring dashboards; cohort/outcome/recidivism reporting; board & grant report pack. (Schema for all of this shipped in Phase 1 — §6.7 — so historical data is already accumulating.)

### Beyond (unscheduled options)

Donor CRM fully in-platform; mentor/alumni portal; QuickBooks integration; mobile app; additional languages; state-DOC data feeds if ever offered.

---

## 11. Open Questions & Risks

### Questions for Jumpstart leadership / counsel (answers change details, not the architecture)

1. **Recidivism definition** — ratify §9.3's working definition before first grant use.
2. **42 CFR Part 2 / clinical status** — confirm with counsel that Jumpstart is a referrer, not a covered treatment provider (assumption #5). If wrong, treatment-related notes need Part 2 consent machinery (design accommodates via §7.2's field classes, but workflows change).
3. **DOC agreements inventory** — collect every signed data-sharing/volunteer agreement per state so §7.5's table and §6.6's facility requirements reflect reality, and confirm none imposes hosting residency (assumption #7).
4. **Bloomerang vs. NeonCRM** — confirm Bloomerang as the consolidation target (§8.2) after a price/feature check.
5. **Retention schedule** — board-ratify §7.6.
6. **Alumni-mentor policy** — minimum time since release/graduation, disqualifying factors, and whether any state permits alumni inside facilities (drives §6.7 screening template content).
7. **Who owns WordPress content** — name the staff editor(s); if nobody, budget a small content contract.

### Top risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Budget/scope collision** — $75k with public layer in Phase 1 is tight | High | Buy-heavy design (this plan), §10 cut lines, fixed-bid against this document, monthly scope review vs. burn |
| **Migration quality** — dedup across Apricot/NeonCRM/Bloomerang; dirty legacy data | High | Month-1 mapping workshop, staged imports with validation reports, idempotent re-runs, staff sign-off before cutover (§8.3) |
| **Single-developer bus factor** | Medium-high | Boring stack, this document, README + ADRs as they build, code in Jumpstart's GitHub org, ≥2 people with admin/deploy access |
| **Staff adoption** — three tools collapse into one; case managers change daily habits | Medium | Module owners embedded from month 1, role-based training, hypercare window, follow-up-queue design that makes the tool useful on day one |
| **SMS compliance/timing** — 10DLC approval delays; TCPA consent gaps | Medium | Register in month 1; consent captured at every phone-number entry point; email/mail fallback paths |
| **DOC relationship variance** — a facility imposes unexpected rules | Medium | Requirements-as-data design (§6.6) absorbs new rules without code changes |
| **Outcome data decay** — alumni stop responding; recidivism numbers weaken | Medium | Check-in waves with multiple channels (§6.12), mentor/session signals, lost-to-follow-up always reported honestly (§9.3) |
| **PII breach** — highest-consequence risk for this population | Low-likelihood / high-impact | §7 controls, minimal justice data stored, vendor-held check reports, pen test before or shortly after go-live, cyber-liability insurance rider (ask the broker) |

---

## Appendix A — Verification Against Success Criteria

| Criterion | Status |
|---|---|
| Dev team could scope and build without inventing architecture | ✅ Stack pinned (§3), repo structure (§3.1), auth model (§3.2), schema sketches + business rules per module (§5–6), integration contracts (§8), phase plan (§10). The dev team still authors the detailed Prisma schema and OpenAPI spec — intended, not a gap |
| Every requirements module → data model + workflows + build-vs-buy | ✅ §6.1–6.14 cover all ten requirement modules plus new scope; requirements' field lists incorporated by reference as the authoritative column inventory |
| Public layer, alumni-to-mentor, and internal platform integrated, not separate products | ✅ Public forms feed internal queues (§6.11); giving syncs to dashboards (§6.8); alumni/mentor is a layer on the shared person model (§5, §6.7) |
| Security/privacy/compliance specific to the population | ✅ §7.3–7.5 (confidential notes, minors, alumni dignity, DOC agreements, data minimization) — not generic |
| Stack recommendation with rationale and cost/effort | ✅ §3, with honest ±25% planning ranges pending dev-partner bids |
| Non-technical ED can read the exec summary and know what they're approving, cost, and duration | ✅ §1, incl. explicit approval list and cost/timeline table |
| **Gaps that could not be fully closed** | ⚠️ (1) Cost ranges are planning-grade until a dev partner bids against this document. (2) Recidivism *verification* depends on DOC data agreements that may never materialize — reporting is honest about verification levels (§9.3) but cannot promise DOC-verified numbers. (3) Legal review items (42 CFR Part 2, retention, TCPA consent wording) are flagged (§11) but need counsel, not architecture. (4) The requirements' 880 lines of field lists were incorporated by reference rather than re-transcribed — the requirements doc must travel with this plan to the dev team |

---

*End of plan. Companion document: “JUMPSTART USA AI Coding Prompt” (authoritative field lists and acceptance criteria). Together these two documents are the dev-team handoff package.*
