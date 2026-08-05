// JUMPSTART USA Operations Platform — database seed script.
//
// Idempotent: if any Role exists the script logs and exits. Set RESEED=1 to
// wipe (dev only) and reseed. All data is fictional — no real PII. Phones use
// the reserved 555-01xx range; personal emails use @example.org.
//
// Run: pnpm --filter @jumpstart/database seed   (tsx prisma/seed.ts)

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  ROLE_KEYS,
  ROLE_NAMES,
  permissionsForRole,
  type RoleKey,
} from '@jumpstart/shared';
import { seedCaseManagementSamples } from './seed-cm-samples';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'JumpstartDemo2026!';

// ── Deterministic helpers ───────────────────────────────────────────────────

let rngState = 20260724;
/** mulberry32 — small seeded PRNG so reseeds produce identical data. */
function rand(): number {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[((i % arr.length) + arr.length) % arr.length];
  if (v === undefined) throw new Error('empty array');
  return v;
}
function pick<T>(arr: readonly T[]): T {
  return at(arr, Math.floor(rand() * arr.length));
}

const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
function daysFromNow(n: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return d;
}
const daysAgo = (n: number) => daysFromNow(-n);
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
/** Fixed calendar date (UTC midnight) for historical anchors. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const min = (a: Date, b: Date) => (a < b ? a : b);

const pad5 = (n: number) => String(n).padStart(5, '0');
const AREA: Record<string, string> = { TN: '615', SC: '803', GA: '404', TX: '512' };
const CITY: Record<string, string> = { TN: 'Nashville', SC: 'Columbia', GA: 'Atlanta', TX: 'Houston' };
function phone(state: string, n: number): string {
  return `${AREA[state] ?? '615'}-555-0${100 + (n % 100)}`;
}

// Audit columns (plain string columns, no FK) — set after the admin user exists.
let AUDIT: { createdById: string; updatedById: string };

// ── RESEED=1 wipe (dev only) ────────────────────────────────────────────────

async function wipe(): Promise<void> {
  // CASCADE truncates every table that references these transitively.
  const tables = [
    'persons', 'users', 'roles', 'permissions', 'institutions',
    'outside_programs', 'transitional_homes', 'onboarding_checklist_templates',
    'mentor_screening_templates', 'donors', 'campaigns', 'events', 'vendors',
    'employers', 'vehicles', 'communication_templates', 'communication_batches',
    'data_sharing_agreements', 'app_settings', 'sync_runs', 'audit_logs',
    'attachments', 'volunteer_applications', 'referrals_inbox', 'session',
  ];
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  console.log('RESEED=1 — existing data wiped');
}

// ═══ 1. PERMISSIONS & ROLES (from @jumpstart/shared) ════════════════════════

async function seedRbac(): Promise<Map<RoleKey, string>> {
  await prisma.permission.createMany({
    data: ALL_PERMISSIONS.map((key) => ({ key })),
    skipDuplicates: true,
  });
  const permIdByKey = new Map<string, string>(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id]),
  );

  const roleIdByKey = new Map<RoleKey, string>();
  for (const key of ROLE_KEYS) {
    const role = await prisma.role.create({
      data: { key, name: ROLE_NAMES[key], isSystem: true },
    });
    roleIdByKey.set(key, role.id);
    await prisma.rolePermission.createMany({
      data: permissionsForRole(key).map((pk) => {
        const permissionId = permIdByKey.get(pk);
        if (!permissionId) throw new Error(`unknown permission ${pk}`);
        return { roleId: role.id, permissionId };
      }),
    });
  }
  return roleIdByKey;
}

// ═══ 2. USERS — admin + one demo user per role (+ a second case manager) ════

interface SeedUsers {
  adminId: string;
  byRole: Record<RoleKey, string>;
  caseManagerIds: string[]; // two real-named case managers
}

const ROLE_USER_NAMES: Record<RoleKey, [string, string]> = {
  admin: ['Admin', 'User'],
  executive: ['Elaine', 'Porter'],
  inside_program_staff: ['David', 'Crowder'],
  outside_program_staff: ['Tonya', 'Reeves'],
  case_manager: ['Rachel', 'Whitfield'],
  housing_staff: ['Samuel', 'Ortega'],
  volunteer_coordinator: ['Grace', 'Linden'],
  development_staff: ['Peter', 'Askew'],
  employment_coordinator: ['Monica', 'Hale'],
  fleet_manager: ['Ray', 'Delgado'],
  read_only: ['Olivia', 'Grant'],
};

async function seedUsers(roleIdByKey: Map<RoleKey, string>): Promise<SeedUsers> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  const byRole = {} as Record<RoleKey, string>;
  for (const key of ROLE_KEYS) {
    const [firstName, lastName] = ROLE_USER_NAMES[key];
    const user = await prisma.user.create({
      data: {
        email: `${key}@jumpstartusa.org`,
        passwordHash,
        firstName,
        lastName,
        status: 'active',
        lastLoginAt: key === 'admin' ? daysAgo(0) : daysAgo(1 + (key.length % 5)),
      },
    });
    byRole[key] = user.id;
    const roleId = roleIdByKey.get(key);
    if (!roleId) throw new Error(`role ${key} missing`);
    await prisma.userRole.create({ data: { userId: user.id, roleId } });
  }

  // Second case manager so assigned-case-manager data has variety.
  const cm2 = await prisma.user.create({
    data: {
      email: 'marcus.boone@jumpstartusa.org',
      passwordHash,
      firstName: 'Marcus',
      lastName: 'Boone',
      status: 'active',
      lastLoginAt: daysAgo(2),
    },
  });
  const cmRoleId = roleIdByKey.get('case_manager');
  if (!cmRoleId) throw new Error('case_manager role missing');
  await prisma.userRole.create({ data: { userId: cm2.id, roleId: cmRoleId } });

  const adminId = byRole.admin;
  // Backfill audit columns on the users/roles themselves.
  await prisma.user.updateMany({ data: { createdById: adminId, updatedById: adminId } });
  await prisma.role.updateMany({ data: { createdById: adminId, updatedById: adminId } });
  await prisma.permission.updateMany({ data: { createdById: adminId, updatedById: adminId } });

  return { adminId, byRole, caseManagerIds: [byRole.case_manager, cm2.id] };
}

// ═══ 3. ONBOARDING CHECKLIST TEMPLATE ═══════════════════════════════════════

const ONBOARDING_ITEMS = [
  'Intake form completed',
  'Identity documents collected',
  'Release paperwork collected',
  'Emergency contact confirmed',
  'Housing need assessed',
  'Employment need assessed',
  'Transportation need assessed',
  'Treatment need assessed',
  'Life skills need assessed',
  'Bible study/mentoring interest recorded',
  'Case manager assigned',
  'Service plan created',
];

interface TemplateInfo {
  id: string;
  items: { id: string; label: string; sortOrder: number }[];
}

async function seedOnboardingTemplate(): Promise<TemplateInfo> {
  const template = await prisma.onboardingChecklistTemplate.create({
    data: {
      name: 'Standard Outside Intake Checklist',
      isDefault: true,
      active: true,
      ...AUDIT,
      items: {
        create: ONBOARDING_ITEMS.map((label, i) => ({ label, sortOrder: i + 1, required: true })),
      },
    },
    include: { items: true },
  });
  return {
    id: template.id,
    items: template.items.map((it) => ({ id: it.id, label: it.label, sortOrder: it.sortOrder })),
  };
}

// ═══ 4. MENTOR SCREENING TEMPLATE ═══════════════════════════════════════════

const MENTOR_CRITERIA = [
  '12+ months post-graduation',
  'Case manager endorsement',
  'Stable housing 6+ months',
  'Stable employment',
  'Pastoral reference',
];

async function seedMentorTemplate(): Promise<TemplateInfo> {
  const template = await prisma.mentorScreeningTemplate.create({
    data: {
      name: 'Alumni Mentor Screening Criteria',
      isDefault: true,
      active: true,
      ...AUDIT,
      items: {
        create: MENTOR_CRITERIA.map((label, i) => ({ label, sortOrder: i + 1, required: true })),
      },
    },
    include: { items: true },
  });
  return {
    id: template.id,
    items: template.items.map((it) => ({ id: it.id, label: it.label, sortOrder: it.sortOrder })),
  };
}

// ═══ 5. INSTITUTIONS + FACILITY CLEARANCE REQUIREMENTS ══════════════════════

interface InstitutionInfo {
  id: string;
  name: string;
  state: string;
  requirements: { id: string; name: string; renewalMonths: number | null }[];
}

const INSTITUTIONS = [
  { name: 'Cumberland Ridge Correctional Facility', type: 'state prison', state: 'TN', city: 'Cookeville', chaplain: 'Rev. Harold Bright', contact: 'Lt. Dana Pruitt', contactRole: 'Volunteer Coordinator' },
  { name: 'Hartsville Transition Center', type: 'transition center', state: 'TN', city: 'Hartsville', chaplain: 'Chaplain Ada Osei', contact: 'Ms. Karen Lowe', contactRole: 'Program Director' },
  { name: 'Palmetto Pines Correctional Institution', type: 'state prison', state: 'SC', city: 'Ridgeville', chaplain: 'Rev. Curtis Mabry', contact: 'Capt. Joel Sanders', contactRole: 'Programs Captain' },
  { name: 'Blue Granite Reentry Center', type: 'transition center', state: 'SC', city: 'Rock Hill', chaplain: 'Chaplain Lena Ford', contact: 'Mr. Andre Gibbs', contactRole: 'Reentry Coordinator' },
  { name: 'Chattahoochee Valley State Prison', type: 'state prison', state: 'GA', city: 'Columbus', chaplain: 'Rev. Tom Ellison', contact: 'Ms. Faye Dupree', contactRole: 'Volunteer Services' },
  { name: 'Brazos Bend Unit', type: 'state prison', state: 'TX', city: 'Rosharon', chaplain: 'Chaplain Ray Nakamura', contact: 'Maj. Vince Carter', contactRole: 'Unit Programs Major' },
];

async function seedInstitutions(): Promise<InstitutionInfo[]> {
  const out: InstitutionInfo[] = [];
  for (let i = 0; i < INSTITUTIONS.length; i++) {
    const spec = at(INSTITUTIONS, i);
    const inst = await prisma.institution.create({
      data: {
        name: spec.name,
        institutionType: spec.type,
        addressLine1: `${1000 + i * 350} State Route ${12 + i}`,
        city: spec.city,
        state: spec.state,
        zip: `${37000 + i * 111}`,
        mainPhone: phone(spec.state, i + 1),
        active: true,
        ...AUDIT,
      },
    });

    // Contact people live in institution_contacts — any number per facility.
    await prisma.institutionContact.createMany({
      data: [
        {
          institutionId: inst.id,
          name: spec.chaplain,
          role: 'Chaplain',
          phone: phone(spec.state, i + 20),
          email: `chaplain.${spec.state.toLowerCase()}${i}@example.org`,
          ...AUDIT,
        },
        {
          institutionId: inst.id,
          name: spec.contact,
          role: spec.contactRole,
          phone: phone(spec.state, i + 40),
          email: `contact.${spec.state.toLowerCase()}${i}@example.org`,
          ...AUDIT,
        },
      ],
    });

    const reqSpecs: { name: string; requirementType: 'background_check' | 'training' | 'document' | 'approval' | 'medical'; renewalMonths: number | null; hardBlock: boolean }[] = [
      { name: 'Background check (within 2 years)', requirementType: 'background_check', renewalMonths: 24, hardBlock: false },
      { name: 'PREA training', requirementType: 'training', renewalMonths: 12, hardBlock: false },
      { name: 'DOC volunteer application', requirementType: 'document', renewalMonths: null, hardBlock: false },
    ];
    if (i === 0) {
      reqSpecs.push(
        { name: 'TB test', requirementType: 'medical', renewalMonths: 12, hardBlock: false },
        { name: 'Warden approval', requirementType: 'approval', renewalMonths: null, hardBlock: true },
      );
    }
    const requirements: InstitutionInfo['requirements'] = [];
    for (const r of reqSpecs) {
      const req = await prisma.facilityClearanceRequirement.create({
        data: { institutionId: inst.id, ...r, active: true, ...AUDIT },
      });
      requirements.push({ id: req.id, name: req.name, renewalMonths: req.renewalMonths });
    }
    out.push({ id: inst.id, name: inst.name, state: inst.state, requirements });
  }
  return out;
}

// ═══ 6. INSIDE CLASSES ══════════════════════════════════════════════════════

interface ClassInfo {
  id: string;
  institutionId: string;
  name: string;
  status: 'planned' | 'active' | 'completed' | 'canceled';
  startDate: Date;
  endDate: Date | null;
}

async function seedInsideClasses(institutions: InstitutionInfo[], staffLeadId: string): Promise<ClassInfo[]> {
  const specs: { name: string; type: string; inst: number; status: ClassInfo['status']; start: Date; end: Date | null }[] = [
    // 3 completed cohorts (referenced by alumni / outside-active enrollments)
    { name: 'JUMPSTART Character Development — Cohort 7', type: 'character', inst: 0, status: 'completed', start: d('2022-10-03'), end: d('2023-03-15') },
    { name: 'Re-Entry Readiness — Cohort 9', type: 'reentry', inst: 1, status: 'completed', start: d('2024-01-08'), end: d('2024-06-20') },
    { name: 'JUMPSTART Character Development — Cohort 11', type: 'character', inst: 2, status: 'completed', start: d('2025-03-03'), end: d('2025-08-10') },
    // 4 active
    { name: 'JUMPSTART Character Development — Cohort 12', type: 'character', inst: 0, status: 'active', start: daysAgo(120), end: daysFromNow(60) },
    { name: 'Re-Entry Readiness — Cohort 10', type: 'reentry', inst: 1, status: 'active', start: daysAgo(90), end: daysFromNow(90) },
    { name: 'Financial Stewardship Basics', type: 'life_skills', inst: 3, status: 'active', start: daysAgo(60), end: daysFromNow(120) },
    { name: 'Malachi Dads Fatherhood Class', type: 'family', inst: 4, status: 'active', start: daysAgo(45), end: daysFromNow(135) },
    // 2 planned
    { name: 'JUMPSTART Character Development — Cohort 13', type: 'character', inst: 5, status: 'planned', start: daysFromNow(30), end: daysFromNow(210) },
    { name: 'Re-Entry Readiness — Cohort 11', type: 'reentry', inst: 2, status: 'planned', start: daysFromNow(45), end: daysFromNow(225) },
    // 1 canceled
    { name: 'Conflict Resolution Workshop', type: 'life_skills', inst: 4, status: 'canceled', start: d('2025-09-01'), end: null },
  ];

  const out: ClassInfo[] = [];
  for (const s of specs) {
    const inst = at(institutions, s.inst);
    const cls = await prisma.insideClass.create({
      data: {
        institutionId: inst.id,
        name: s.name,
        classType: s.type,
        startDate: s.start,
        endDate: s.end,
        status: s.status,
        staffLeadId,
        notes: s.status === 'canceled' ? 'Canceled — facility lockdown made the schedule unworkable.' : null,
        ...AUDIT,
      },
    });
    out.push({ id: cls.id, institutionId: inst.id, name: s.name, status: s.status, startDate: s.start, endDate: s.end });
  }
  return out;
}

// ═══ 7. PARTICIPANTS (48 persons + profiles + contacts + doc ids + history) ═

type Group = 'inside' | 'outside' | 'alumni' | 'other';

interface PRec {
  i: number;
  group: Group;
  profileId: string;
  personId: string;
  firstName: string;
  lastName: string;
  state: string;
  intakeDate: Date;
  releaseDate: Date | null;
  graduationDate: Date | null;
  caseManagerId: string | null;
}

const P_MALE = ['James', 'Marcus', 'Darnell', 'Tyrone', 'Kevin', 'Ronnie', 'Alvin', 'Chris', 'Terrence', 'Billy', 'Jerome', 'Dustin', 'Hector', 'Willie', 'Nathan', 'Freddie', 'Cedric', 'Lamar'];
const P_FEMALE = ['Tanya', 'Denise', 'Angela', 'Latoya', 'Carmen', 'Brittany', 'Sheila', 'Yvonne'];
const P_LAST = ['Hollis', 'Draper', 'McCray', 'Tibbs', 'Vann', 'Ledbetter', 'Okafor', 'Pruett', 'Ganaway', 'Sizemore', 'Delacruz', 'Winbush', 'Farrow', 'Kimbrough', 'Statler', 'Oglesby', 'Renfro', 'Casteel', 'Mabern', 'Trudeau', 'Hixson', 'Palmore', 'Estrada', 'Whitlock'];
const P_STATES = ['TN', 'TN', 'SC', 'GA', 'TX', 'TN', 'SC', 'GA'];
const ALUMNI_GRADS = ['2024-02-16', '2024-05-24', '2024-08-30', '2024-11-15', '2025-02-21', '2025-05-16', '2025-08-22', '2025-11-21', '2026-02-20', '2026-05-15'];

function participantIdentity(i: number): { firstName: string; lastName: string; gender: 'male' | 'female' } {
  const female = i % 6 === 4;
  return {
    firstName: female ? at(P_FEMALE, Math.floor(i / 6)) : at(P_MALE, i),
    lastName: at(P_LAST, i * 7 + 3),
    gender: female ? 'female' : 'male',
  };
}

async function seedParticipants(caseManagerIds: string[]): Promise<PRec[]> {
  const out: PRec[] = [];
  const historyRows: {
    participantProfileId: string; domain: string; fromValue: string | null;
    toValue: string; effectiveDate: Date; reason: string | null; changedById: string;
  }[] = [];
  const counters: Record<string, number> = { '2025': 0, '2026': 0 };

  for (let i = 0; i < 48; i++) {
    const { firstName, lastName, gender } = participantIdentity(i);
    const state = at(P_STATES, i);
    const group: Group = i < 12 ? 'inside' : i < 30 ? 'outside' : i < 40 ? 'alumni' : 'other';

    // Statuses + anchor dates per group
    let insideStatus: 'not_applicable' | 'enrolled' | 'active' | 'completed' | 'released' | 'withdrawn' = 'completed';
    let outsideStatus: 'not_applicable' | 'intake' | 'active' | 'completed' | 'inactive' | 'withdrawn' = 'not_applicable';
    let alumniStatus: 'not_applicable' | 'alumni' | 'alumni_engaged' = 'not_applicable';
    let intakeDate: Date;
    let releaseDate: Date | null = null;
    let graduationDate: Date | null = null;
    let caseManagerId: string | null = null;

    if (group === 'inside') {
      insideStatus = i < 7 ? 'active' : 'enrolled';
      intakeDate = daysAgo(400 - i * 25);
    } else if (group === 'outside') {
      const j = i - 12;
      outsideStatus = 'active';
      releaseDate = daysAgo(330 - j * 15);
      intakeDate = addDays(releaseDate, 7);
      caseManagerId = at(caseManagerIds, j);
    } else if (group === 'alumni') {
      const k = i - 30;
      outsideStatus = 'completed';
      alumniStatus = k % 2 === 0 ? 'alumni_engaged' : 'alumni';
      graduationDate = d(at(ALUMNI_GRADS, k));
      releaseDate = addDays(graduationDate, -300);
      intakeDate = addDays(releaseDate, 10);
      caseManagerId = at(caseManagerIds, k);
    } else {
      // 40,41 withdrawn · 42,43 intake · 44,45 inactive · 46,47 inside-withdrawn
      if (i <= 41) {
        outsideStatus = 'withdrawn';
        insideStatus = i === 40 ? 'withdrawn' : 'completed';
        releaseDate = daysAgo(300 - (i - 40) * 40);
        intakeDate = addDays(releaseDate, 7);
      } else if (i <= 43) {
        outsideStatus = 'intake';
        releaseDate = daysAgo(i === 42 ? 20 : 12);
        intakeDate = addDays(releaseDate, 3);
        caseManagerId = at(caseManagerIds, i);
      } else if (i <= 45) {
        outsideStatus = 'inactive';
        releaseDate = daysAgo(500 - (i - 44) * 60);
        intakeDate = addDays(releaseDate, 7);
        caseManagerId = at(caseManagerIds, i);
      } else {
        insideStatus = 'withdrawn';
        intakeDate = d(i === 46 ? '2024-01-15' : '2025-03-10');
      }
    }

    const birthYear = 1966 + ((i * 7) % 35);
    const hasEmail = i % 5 !== 3;
    const hasPhone = i % 7 !== 6;
    const smsOk = hasPhone && group !== 'inside' && i % 3 !== 2;
    const person = await prisma.person.create({
      data: {
        firstName,
        lastName,
        preferredName: i % 9 === 2 ? firstName.slice(0, 3) : null,
        dateOfBirth: d(`${birthYear}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`),
        gender,
        primaryPhone: hasPhone ? phone(state, i) : null,
        primaryEmail: hasEmail ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.org` : null,
        addressLine1: group === 'inside' ? null : `${100 + i * 13} ${at(['Oak', 'Maple', 'Cedar', 'Elm', 'Walnut'], i)} Street`,
        city: group === 'inside' ? null : CITY[state],
        state,
        zip: group === 'inside' ? null : `${37200 + i}`,
        emailOk: hasEmail,
        smsOk,
        smsConsentAt: smsOk ? intakeDate : null,
        ...AUDIT,
      },
    });

    const year = intakeDate.getFullYear() <= 2025 ? '2025' : '2026';
    counters[year] = (counters[year] ?? 0) + 1;
    const profile = await prisma.participantProfile.create({
      data: {
        personId: person.id,
        participantNumber: `P-${year}-${pad5(counters[year] ?? 1)}`,
        insideStatus,
        outsideStatus,
        alumniStatus,
        phase: outsideStatus === 'active' ? at(['Phase 1', 'Phase 2', 'Phase 3'], i) : null,
        intakeDate,
        releaseDate,
        graduationDate,
        assignedCaseManagerId: caseManagerId,
        ...AUDIT,
      },
    });

    // 1–2 contacts; exactly one minor contact across the whole dataset (i=14)
    await prisma.personContact.create({
      data: {
        personId: person.id,
        name: `${at(['Mary', 'Gloria', 'Ruth', 'Janet', 'Diane'], i)} ${lastName}`,
        relationship: at(['Mother', 'Sister', 'Spouse', 'Brother', 'Aunt'], i),
        phone: phone(state, i + 50),
        isEmergency: true,
        ...AUDIT,
      },
    });
    if (i === 14) {
      await prisma.personContact.create({
        data: {
          personId: person.id,
          name: `Jayla ${lastName}`,
          relationship: 'Daughter',
          isMinor: true,
          guardianName: `Denise ${lastName}`,
          phone: phone(state, i + 70), // guardian's phone
          notes: 'Minor — contact via guardian only.',
          ...AUDIT,
        },
      });
    } else if (i % 3 === 0) {
      await prisma.personContact.create({
        data: {
          personId: person.id,
          name: `${at(['Carl', 'Vera', 'Otis', 'Nina'], i)} ${at(P_LAST, i + 11)}`,
          relationship: at(['Friend', 'Pastor', 'Cousin', 'Sponsor'], i),
          phone: phone(state, i + 60),
          isEmergency: false,
          ...AUDIT,
        },
      });
    }

    await prisma.participantDocId.create({
      data: {
        participantProfileId: profile.id,
        state,
        docNumber: `${state}-${100000 + i * 137}`,
        source: 'staff_entered',
        ...AUDIT,
      },
    });

    // Status history — ascending, consistent with current statuses
    const push = (domain: string, fromValue: string | null, toValue: string, effectiveDate: Date, reason: string | null = null) =>
      historyRows.push({ participantProfileId: profile.id, domain, fromValue, toValue, effectiveDate, reason, changedById: AUDIT.createdById });

    if (group === 'inside') {
      push('inside_status', null, 'enrolled', intakeDate, 'Enrolled in inside class');
      if (insideStatus === 'active') push('inside_status', 'enrolled', 'active', addDays(intakeDate, 21));
    } else if (insideStatus === 'withdrawn') {
      push('inside_status', null, 'enrolled', intakeDate, 'Enrolled in inside class');
      push('inside_status', 'enrolled', 'active', addDays(intakeDate, 21));
      push('inside_status', 'active', 'withdrawn', addDays(intakeDate, 90), 'Left class early');
      if (releaseDate) {
        push('outside_status', null, 'intake', addDays(releaseDate, 7));
        push('outside_status', 'intake', 'withdrawn', addDays(releaseDate, 60), 'Stopped engaging with program');
      }
    } else if (releaseDate) {
      const classEnd = addDays(releaseDate, -30);
      push('inside_status', null, 'enrolled', addDays(classEnd, -160), 'Enrolled in inside class');
      push('inside_status', 'enrolled', 'active', addDays(classEnd, -140));
      push('inside_status', 'active', 'completed', classEnd, 'Completed inside class');
      push('inside_status', 'completed', 'released', releaseDate, 'Released from custody');
      push('outside_status', null, 'intake', intakeDate, 'Outside program intake');
      if (outsideStatus !== 'intake') {
        push('outside_status', 'intake', 'active', addDays(intakeDate, 14));
      }
      if (outsideStatus === 'completed' && graduationDate) {
        push('outside_status', 'active', 'completed', graduationDate, 'Graduated outside program');
        push('alumni_status', null, 'alumni', graduationDate);
        if (alumniStatus === 'alumni_engaged') push('alumni_status', 'alumni', 'alumni_engaged', addDays(graduationDate, 60));
      } else if (outsideStatus === 'withdrawn') {
        push('outside_status', 'active', 'withdrawn', addDays(intakeDate, 75), 'Withdrew from program');
      } else if (outsideStatus === 'inactive') {
        push('outside_status', 'active', 'inactive', addDays(intakeDate, 120), 'Lost contact');
      }
    }

    out.push({ i, group, profileId: profile.id, personId: person.id, firstName, lastName, state, intakeDate, releaseDate, graduationDate, caseManagerId });
  }

  await prisma.participantStatusHistory.createMany({ data: historyRows });
  return out;
}

// ═══ 8. INSIDE CLASS ENROLLMENTS ════════════════════════════════════════════

const ASSESS = ['green', 'blue', 'green', 'green', 'yellow', 'blue', 'green', 'red', 'green', 'blue', 'yellow', 'green'] as const;

async function seedInsideEnrollments(participants: PRec[], classes: ClassInfo[]): Promise<void> {
  const byIdx = (i: number) => {
    const p = participants.find((x) => x.i === i);
    if (!p) throw new Error(`participant ${i} missing`);
    return p;
  };
  const completedClasses = classes.filter((c) => c.status === 'completed'); // [C1 2023, C2 2024, C3 2025]
  const activeClasses = classes.filter((c) => c.status === 'active');
  const c1 = at(completedClasses, 0);
  const c2 = at(completedClasses, 1);
  const c3 = at(completedClasses, 2);

  type Row = {
    p: PRec; cls: ClassInfo;
    status: 'enrolled' | 'active' | 'completed' | 'left_early' | 'removed' | 'transferred';
    leftReason?: string;
  };
  const rows: Row[] = [];

  // Currently-inside participants → active classes
  for (let i = 0; i < 12; i++) {
    const p = byIdx(i);
    rows.push({ p, cls: at(activeClasses, i % activeClasses.length), status: i < 7 ? 'active' : 'enrolled' });
  }
  // Alumni cohorts: C1 for the 2024-era grads, C2 for later grads
  for (let k = 0; k < 10; k++) rows.push({ p: byIdx(30 + k), cls: k < 5 ? c1 : c2, status: 'completed' });
  // Outside-active: even j → C3, odd j → C2 (13 left C2 early, later completed C3)
  for (let j = 0; j < 18; j++) {
    const p = byIdx(12 + j);
    if (p.i === 13) {
      rows.push({ p, cls: c2, status: 'left_early', leftReason: 'Transferred to another facility mid-cohort' });
      rows.push({ p, cls: c3, status: 'completed' });
    } else {
      rows.push({ p, cls: j % 2 === 0 ? c3 : c2, status: 'completed' });
    }
  }
  // Others: 40 left early, 41/44 completed, 45 transferred C2→completed C3,
  // 46 removed, 47 left early, 42/43 completed C3 (recent releases)
  rows.push({ p: byIdx(40), cls: c2, status: 'left_early', leftReason: 'Voluntarily withdrew — family emergency' });
  rows.push({ p: byIdx(41), cls: c2, status: 'completed' });
  rows.push({ p: byIdx(42), cls: c3, status: 'completed' });
  rows.push({ p: byIdx(43), cls: c3, status: 'completed' });
  rows.push({ p: byIdx(44), cls: c2, status: 'completed' });
  rows.push({ p: byIdx(45), cls: c2, status: 'transferred' });
  rows.push({ p: byIdx(45), cls: c3, status: 'completed' });
  rows.push({ p: byIdx(46), cls: c2, status: 'removed', leftReason: 'Removed by facility for disciplinary infraction' });
  rows.push({ p: byIdx(47), cls: c3, status: 'left_early', leftReason: 'Lost interest and stopped attending' });

  let n = 0;
  for (const r of rows) {
    n++;
    const enrollmentDate = addDays(r.cls.startDate, 3 + (n % 10));
    const classEnd = r.cls.endDate ?? addDays(r.cls.startDate, 150);
    await prisma.insideClassEnrollment.create({
      data: {
        participantProfileId: r.p.profileId,
        insideClassId: r.cls.id,
        enrollmentDate,
        completionStatus: r.status,
        completionDate: r.status === 'completed' ? classEnd : null,
        leftEarlyDate: r.status === 'left_early' ? addDays(r.cls.startDate, 45 + (n % 30)) : null,
        leftEarlyReason: r.status === 'left_early' ? (r.leftReason ?? null) : null,
        // Business rule: every completed enrollment carries a final assessment
        finalAssessment: r.status === 'completed' ? at(ASSESS, n) : null,
        assessmentNotes: r.status === 'completed' && n % 4 === 0 ? 'Strong finish — recommended for outside program.' : null,
        notes: r.status === 'removed' || r.status === 'transferred' ? r.leftReason ?? 'Transferred to a later cohort.' : null,
        ...AUDIT,
      },
    });
  }
}

// ═══ 9. OUTSIDE PROGRAMS + ENROLLMENTS ══════════════════════════════════════

interface ProgramInfo { id: string; name: string }

async function seedOutsidePrograms(users: SeedUsers, participants: PRec[]): Promise<ProgramInfo[]> {
  const specs: { name: string; type: 'life_skills' | 'bible_study' | 'employment_assistance' | 'treatment' | 'mentoring' | 'transportation'; state: string; schedule: string; lead: string; volunteerLead?: string }[] = [
    { name: 'New Beginnings Life Skills', type: 'life_skills', state: 'TN', schedule: 'Tuesdays 6:30pm', lead: users.byRole.outside_program_staff },
    { name: 'Foundations Bible Study', type: 'bible_study', state: 'TN', schedule: 'Thursdays 7:00pm', lead: users.byRole.outside_program_staff, volunteerLead: 'Walt Pemberton' },
    { name: 'Career Pathways Workshop', type: 'employment_assistance', state: 'TN', schedule: 'Mondays 10:00am', lead: users.byRole.employment_coordinator },
    { name: 'Hope Recovery Referral Program', type: 'treatment', state: 'TN', schedule: 'By referral', lead: at(users.caseManagerIds, 0), volunteerLead: 'Riverside Recovery Center (partner)' },
    { name: 'One-to-One Mentoring', type: 'mentoring', state: 'TN', schedule: 'Set by each match', lead: users.byRole.volunteer_coordinator },
    { name: 'Wheels to Work Transportation', type: 'transportation', state: 'TN', schedule: 'Weekdays 6:00am-6:00pm', lead: users.byRole.fleet_manager },
    { name: 'Columbia Life Skills Cohort', type: 'life_skills', state: 'SC', schedule: 'Wednesdays 6:00pm', lead: users.byRole.outside_program_staff },
    { name: 'Grace Notes Bible Study', type: 'bible_study', state: 'GA', schedule: 'Sundays 4:00pm', lead: users.byRole.outside_program_staff, volunteerLead: 'Deb Calloway' },
  ];
  const programs: ProgramInfo[] = [];
  for (let i = 0; i < specs.length; i++) {
    const s = at(specs, i);
    const prog = await prisma.outsideProgram.create({
      data: {
        name: s.name,
        programType: s.type,
        location: `${CITY[s.state]}, ${s.state}`,
        state: s.state,
        startDate: d('2024-01-08'),
        recurringSchedule: s.schedule,
        staffLeadId: s.lead,
        volunteerLeadName: s.volunteerLead ?? null,
        capacity: 12 + (i % 3) * 6,
        status: 'active',
        ...AUDIT,
      },
    });
    programs.push({ id: prog.id, name: s.name });
  }

  // Enrollments: outside-active in 1–3 active programs; alumni carry completed history
  for (const p of participants.filter((x) => x.group === 'outside')) {
    const j = p.i - 12;
    const mine = [j % 8, (j + 3) % 8];
    if (j % 2 === 0) mine.push((j + 5) % 8);
    for (let m = 0; m < mine.length; m++) {
      const prog = at(programs, at(mine, m));
      // only long-enough tenures have a finished first program (keeps completionDate in the past)
      const done = m === 1 && j % 3 === 0 && addDays(p.intakeDate, 130) < TODAY;
      await prisma.outsideProgramEnrollment.create({
        data: {
          participantProfileId: p.profileId,
          outsideProgramId: prog.id,
          enrollmentDate: addDays(p.intakeDate, 14 + m * 7),
          status: done ? 'completed' : 'active',
          completionDate: done ? addDays(p.intakeDate, 120) : null,
          completionAssessment: done ? at(ASSESS, j + m) : null,
          ...AUDIT,
        },
      });
    }
  }
  for (const p of participants.filter((x) => x.group === 'alumni')) {
    const k = p.i - 30;
    const grad = p.graduationDate ?? TODAY;
    for (let m = 0; m < 2; m++) {
      await prisma.outsideProgramEnrollment.create({
        data: {
          participantProfileId: p.profileId,
          outsideProgramId: at(programs, (k + m * 3) % 8).id,
          enrollmentDate: addDays(p.intakeDate, 14 + m * 10),
          status: 'completed',
          completionDate: addDays(grad, -15 - m * 20),
          completionAssessment: at(ASSESS, k + m + 1),
          ...AUDIT,
        },
      });
    }
  }
  return programs;
}

// ═══ 10. TRANSITIONAL HOMES + HOUSING ENROLLMENTS ═══════════════════════════

async function seedHousing(participants: PRec[]): Promise<void> {
  const specs = [
    { name: 'Isaiah House', state: 'TN', city: 'Nashville', capacity: 6, mgr: 'Frank Teller' },
    { name: 'Damascus House', state: 'TN', city: 'Memphis', capacity: 8, mgr: 'Louise Handley' },
    { name: 'New Hope Home', state: 'SC', city: 'Columbia', capacity: 6, mgr: 'Gil Robey' },
    { name: 'Restoration House', state: 'SC', city: 'Greenville', capacity: 6, mgr: 'Tessa Marsh' },
    { name: 'Ebenezer House', state: 'GA', city: 'Atlanta', capacity: 6, mgr: 'Amos Whitaker' },
  ];
  const homes: { id: string; name: string }[] = [];
  for (let i = 0; i < specs.length; i++) {
    const s = at(specs, i);
    const home = await prisma.transitionalHome.create({
      data: {
        name: s.name,
        addressLine1: `${400 + i * 27} ${at(['Chestnut', 'Poplar', 'Sycamore', 'Magnolia', 'Dogwood'], i)} Avenue`,
        city: s.city,
        state: s.state,
        zip: `${38000 + i * 55}`,
        phone: phone(s.state, i + 30),
        houseManagerName: s.mgr,
        houseManagerPhone: phone(s.state, i + 80),
        houseManagerEmail: `${s.mgr.split(' ')[0]?.toLowerCase()}.${s.mgr.split(' ')[1]?.toLowerCase()}@example.org`,
        capacity: s.capacity,
        active: true,
        ...AUDIT,
      },
    });
    homes.push({ id: home.id, name: s.name });
  }
  const homeAt = (n: number) => at(homes, n);

  // Current residents: all 18 outside-active + the 2 intake participants (~63% occupancy)
  for (const p of participants.filter((x) => x.group === 'outside')) {
    const j = p.i - 12;
    if (p.i === 12) {
      // The transfer pair: Isaiah House → Ebenezer House on the same date
      const transferDate = daysAgo(60);
      await prisma.housingEnrollment.create({
        data: {
          participantProfileId: p.profileId, homeId: homeAt(0).id,
          moveInDate: addDays(p.intakeDate, 3), moveOutDate: transferDate,
          status: 'transferred',
          reasonForLeaving: 'Transferred to Ebenezer House to be closer to new employment',
          ...AUDIT,
        },
      });
      await prisma.housingEnrollment.create({
        data: {
          participantProfileId: p.profileId, homeId: homeAt(4).id,
          moveInDate: transferDate, status: 'active', ...AUDIT,
        },
      });
      continue;
    }
    await prisma.housingEnrollment.create({
      data: {
        participantProfileId: p.profileId, homeId: homeAt(j % 5).id,
        moveInDate: addDays(p.intakeDate, 3), status: 'active', ...AUDIT,
      },
    });
  }
  for (const i of [42, 43]) {
    const p = participants.find((x) => x.i === i);
    if (!p) continue;
    await prisma.housingEnrollment.create({
      data: {
        participantProfileId: p.profileId, homeId: homeAt(i - 42).id,
        moveInDate: addDays(p.intakeDate, 1), status: 'active', ...AUDIT,
      },
    });
  }

  // History: alumni completed stints; withdrawn/inactive exits with reasons
  for (const p of participants.filter((x) => x.group === 'alumni')) {
    const k = p.i - 30;
    const grad = p.graduationDate ?? TODAY;
    await prisma.housingEnrollment.create({
      data: {
        participantProfileId: p.profileId, homeId: homeAt(k % 5).id,
        moveInDate: addDays(p.intakeDate, 5), moveOutDate: addDays(grad, -30),
        status: 'completed',
        reasonForLeaving: 'Completed transitional housing program — moved to independent housing',
        completionAssessment: k === 4 ? 'yellow' : at(['blue', 'green', 'green', 'blue'] as const, k),
        ...AUDIT,
      },
    });
  }
  const exits: { i: number; status: 'left_early' | 'removed' | 'completed'; reason: string; assess?: 'green' | 'yellow' }[] = [
    { i: 40, status: 'left_early', reason: 'Left voluntarily against staff advice' },
    { i: 41, status: 'removed', reason: 'House rules violation — repeated curfew misses' },
    { i: 44, status: 'completed', reason: 'Completed housing phase before going inactive', assess: 'green' },
  ];
  for (const e of exits) {
    const p = participants.find((x) => x.i === e.i);
    if (!p) continue;
    await prisma.housingEnrollment.create({
      data: {
        participantProfileId: p.profileId, homeId: homeAt(e.i % 5).id,
        moveInDate: addDays(p.intakeDate, 4), moveOutDate: addDays(p.intakeDate, 70),
        status: e.status, reasonForLeaving: e.reason,
        completionAssessment: e.assess ?? null,
        ...AUDIT,
      },
    });
  }
}

// ═══ 14. CRM — donors, donations, campaigns, events, vendors ════════════════
// (Seeded before case management/volunteers: referrals need vendors, event
// assignments/registrations need events.)

interface CrmInfo {
  vendors: { id: string; name: string }[];
  referralPartnerIds: string[];
  autoShopIds: string[];
  events: { id: string; name: string }[];
}

async function seedCrm(participants: PRec[], users: SeedUsers): Promise<CrmInfo> {
  // Campaigns
  const campaignA = await prisma.campaign.create({
    data: {
      name: '2025 Second Chance Campaign', status: 'completed',
      description: 'Year-end giving campaign funding re-entry services.',
      startDate: d('2025-09-01'), endDate: d('2025-12-31'), goalAmount: 25000, ...AUDIT,
    },
  });
  const campaignB = await prisma.campaign.create({
    data: {
      name: 'Homes of Hope 2026', status: 'active',
      description: 'Capital campaign to open a sixth transitional home.',
      startDate: d('2026-02-01'), endDate: d('2026-12-31'), goalAmount: 40000, ...AUDIT,
    },
  });
  await prisma.campaign.create({
    data: {
      name: 'Vehicles for Victory 2027', status: 'planned',
      description: 'Replace two aging ministry vans.',
      startDate: d('2027-01-15'), goalAmount: 60000, ...AUDIT,
    },
  });

  // Events (one past event linked to campaign A)
  const eventSpecs = [
    { name: '2025 Second Chance Banquet', type: 'fundraiser', date: d('2025-10-17'), loc: 'Nashville, TN', campaignId: campaignA.id, attendance: 220, revenue: 48500, expenses: 12300 },
    { name: 'Spring Volunteer Appreciation Dinner', type: 'volunteer appreciation', date: d('2026-04-11'), loc: 'Nashville, TN', campaignId: null, attendance: 60, revenue: 0, expenses: 1800 },
    { name: 'Summer Graduation Celebration', type: 'graduation', date: daysFromNow(18), loc: 'Nashville, TN', campaignId: null, attendance: null, revenue: null, expenses: null },
    { name: '2026 Second Chance Banquet', type: 'fundraiser', date: daysFromNow(115), loc: 'Franklin, TN', campaignId: campaignB.id, attendance: null, revenue: null, expenses: null },
  ];
  const events: CrmInfo['events'] = [];
  for (const e of eventSpecs) {
    const ev = await prisma.event.create({
      data: {
        name: e.name, eventType: e.type, eventDate: e.date, location: e.loc,
        campaignId: e.campaignId, attendanceCount: e.attendance,
        revenue: e.revenue, expenses: e.expenses, ...AUDIT,
      },
    });
    events.push({ id: ev.id, name: e.name });
  }
  // Registrations — alumni persons attended the banquet; upcoming graduation RSVPs
  const alum = participants.filter((p) => p.group === 'alumni');
  const banquet = at(events, 0);
  const graduation = at(events, 2);
  for (let a = 0; a < 3; a++) {
    await prisma.eventRegistration.create({
      data: { eventId: banquet.id, personId: at(alum, a * 2).personId, status: 'attended', checkedInAt: d('2025-10-17'), ...AUDIT },
    });
  }
  await prisma.eventRegistration.create({
    data: { eventId: banquet.id, externalName: 'Harriet Bell', externalEmail: 'harriet.bell@example.org', status: 'attended', ...AUDIT },
  });
  for (let a = 0; a < 4; a++) {
    await prisma.eventRegistration.create({
      data: { eventId: graduation.id, personId: at(alum, a * 2 + 1).personId, status: 'registered', ...AUDIT },
    });
  }

  // Donors (12) — one is also an internal person (volunteer/donor overlap set later is unnecessary; leave personId null here, linked donor added in volunteers step is overkill — keep one linked below via alumni person)
  const donorSpecs: { name: string; type: 'individual' | 'organization' | 'church' | 'business' | 'foundation'; bloomerang?: string; contact?: string; state: string; personIdx?: number }[] = [
    { name: 'Harold & June Wetherby', type: 'individual', bloomerang: 'BL-84512', state: 'TN' },
    { name: 'First Covenant Church of Nashville', type: 'church', bloomerang: 'BL-84520', contact: 'Pastor Neil Ogden', state: 'TN' },
    { name: 'Stanton Freight Lines LLC', type: 'business', bloomerang: 'BL-84533', contact: 'Rhonda Stanton', state: 'TN' },
    { name: 'The Kettering Family Foundation', type: 'foundation', bloomerang: 'BL-84541', contact: 'Grants Office', state: 'GA' },
    { name: 'Miriam Doss', type: 'individual', state: 'SC' },
    { name: 'Calvary Ridge Fellowship', type: 'church', bloomerang: 'BL-84559', contact: 'Deacon Ed Pratt', state: 'SC' },
    { name: 'Aldon Perry', type: 'individual', state: 'TN' },
    { name: 'Grace Point Community Church', type: 'church', state: 'GA' },
    { name: 'Trumbull & Vance CPAs', type: 'business', contact: 'Kay Trumbull', state: 'TN' },
    { name: 'Evelyn Roundtree', type: 'individual', bloomerang: 'BL-84568', state: 'TX' },
    { name: 'Doyle Hutchins', type: 'individual', state: 'TN' },
    { name: 'Marguerite Sablan', type: 'individual', state: 'TN', personIdx: 30 }, // an alumnus who now gives
  ];
  const donors: { id: string }[] = [];
  for (let i = 0; i < donorSpecs.length; i++) {
    const s = at(donorSpecs, i);
    const linkedPerson = s.personIdx !== undefined ? participants.find((p) => p.i === s.personIdx) : undefined;
    const donor = await prisma.donor.create({
      data: {
        name: linkedPerson ? `${linkedPerson.firstName} ${linkedPerson.lastName}` : s.name,
        donorType: s.type,
        bloomerangId: s.bloomerang ?? null,
        contactPerson: s.contact ?? null,
        phone: phone(s.state, i + 10),
        email: `donor${i + 1}@example.org`,
        addressLine1: `${200 + i * 31} ${at(['Belmont', 'Granny White', 'Harding', 'Woodmont'], i)} Pike`,
        city: CITY[s.state], state: s.state, zip: `${37100 + i}`,
        status: i === 10 ? 'lapsed' : 'active',
        personId: linkedPerson?.personId ?? null,
        lastSyncedAt: s.bloomerang ? daysAgo(1) : null,
        ...AUDIT,
      },
    });
    donors.push({ id: donor.id });
  }
  const donorAt = (n: number) => at(donors, n);

  // Donations (35): campaign A exceeds its 25k goal; campaign B sits ~60% of 40k
  const donationSpecs: { donor: number; date: Date; amount: number; fund: string; campaignId?: string; eventId?: string; recurring?: boolean; method?: string }[] = [
    // Campaign A: 10,000 + 8,500 + 5,000 + 2,500 + 1,500 = 27,500 (goal exceeded)
    { donor: 3, date: d('2025-09-20'), amount: 10000, fund: 'General', campaignId: campaignA.id, method: 'check' },
    { donor: 2, date: d('2025-10-17'), amount: 8500, fund: 'General', campaignId: campaignA.id, eventId: banquet.id, method: 'check' },
    { donor: 1, date: d('2025-11-05'), amount: 5000, fund: 'General', campaignId: campaignA.id, method: 'ach' },
    { donor: 0, date: d('2025-12-12'), amount: 2500, fund: 'General', campaignId: campaignA.id, method: 'card' },
    { donor: 8, date: d('2025-12-30'), amount: 1500, fund: 'General', campaignId: campaignA.id, method: 'card' },
    // Campaign B: 10,000 + 7,500 + 5,000 + 1,500 = 24,000 (~60% of 40,000)
    { donor: 3, date: d('2026-03-02'), amount: 10000, fund: 'Housing', campaignId: campaignB.id, method: 'check' },
    { donor: 5, date: d('2026-04-14'), amount: 7500, fund: 'Housing', campaignId: campaignB.id, method: 'check' },
    { donor: 2, date: d('2026-05-21'), amount: 5000, fund: 'Housing', campaignId: campaignB.id, method: 'ach' },
    { donor: 4, date: d('2026-06-10'), amount: 1500, fund: 'Housing', campaignId: campaignB.id, method: 'card' },
  ];
  // Recurring monthly gifts (donor 6): Jan–Jun 2026
  for (let m = 1; m <= 6; m++) {
    donationSpecs.push({ donor: 6, date: d(`2026-0${m}-15`), amount: 100, fund: 'General', recurring: true, method: 'card' });
  }
  // General giving spread across 2024–2026
  const generalDates = ['2024-03-08', '2024-05-19', '2024-07-30', '2024-09-12', '2024-11-29', '2024-12-20', '2025-01-25', '2025-03-16', '2025-05-04', '2025-06-27', '2025-08-09', '2026-01-31', '2026-02-19', '2026-04-06', '2026-05-27', '2026-06-30', '2026-07-10', '2024-12-31', '2025-04-21', '2026-03-25'];
  const generalAmounts = [25, 250, 75, 1200, 500, 3500, 150, 60, 800, 40, 2000, 350, 90, 125, 600, 275, 50, 4500, 175, 1000];
  for (let g = 0; g < generalDates.length; g++) {
    donationSpecs.push({
      donor: (g * 5 + 1) % 12,
      date: d(at(generalDates, g)),
      amount: at(generalAmounts, g),
      fund: g % 4 === 0 ? 'Housing' : 'General',
      method: at(['card', 'check', 'cash', 'ach'], g),
    });
  }
  for (const s of donationSpecs) {
    await prisma.donation.create({
      data: {
        donorId: donorAt(s.donor).id,
        donationDate: s.date,
        amount: s.amount,
        paymentMethod: s.method ?? 'card',
        fund: s.fund,
        isRecurring: s.recurring ?? false,
        receiptSent: s.date < daysAgo(14),
        campaignId: s.campaignId ?? null,
        eventId: s.eventId ?? null,
        lastSyncedAt: daysAgo(1),
        ...AUDIT,
      },
    });
  }

  // Vendors (8): 3 referral partners, 2 auto shops, 3 general
  const vendorSpecs: { name: string; services: string; referral?: boolean; state: string; contact: string }[] = [
    { name: 'Riverside Recovery Center', services: 'Residential and outpatient substance abuse treatment', referral: true, state: 'TN', contact: 'Intake Desk' },
    { name: 'Drive Forward DMV Assistance', services: 'Driver license reinstatement and state ID help', referral: true, state: 'TN', contact: 'Lucia Marsh' },
    { name: 'Harvest Hands Food Bank', services: 'Emergency food boxes and grocery assistance', referral: true, state: 'TN', contact: 'Warehouse Office' },
    { name: 'Precision Auto Care', services: 'Fleet maintenance and repair', state: 'TN', contact: 'Gus Little' },
    { name: 'Hilltop Tire & Service', services: 'Tires, brakes, oil changes', state: 'TN', contact: 'Front Desk' },
    { name: 'Cornerstone Office Supplies', services: 'Office and program supplies', state: 'TN', contact: 'Orders Team' },
    { name: 'Palmetto Print Shop', services: 'Printing and mailing services', state: 'SC', contact: 'Roy Deese' },
    { name: 'BrightWeb Hosting', services: 'Website hosting and email', state: 'GA', contact: 'Support' },
  ];
  const vendors: CrmInfo['vendors'] = [];
  for (let i = 0; i < vendorSpecs.length; i++) {
    const s = at(vendorSpecs, i);
    const v = await prisma.vendor.create({
      data: {
        name: s.name, contactPerson: s.contact, phone: phone(s.state, i + 25),
        email: `vendor${i + 1}@example.org`,
        addressLine1: `${500 + i * 41} Commerce Way`, city: CITY[s.state], state: s.state, zip: `${37300 + i}`,
        servicesProvided: s.services, isReferralPartner: s.referral ?? false, active: true, ...AUDIT,
      },
    });
    vendors.push({ id: v.id, name: s.name });
  }
  return {
    vendors,
    referralPartnerIds: vendors.slice(0, 3).map((v) => v.id),
    autoShopIds: [at(vendors, 3).id, at(vendors, 4).id],
    events,
  };
}

// ═══ 11. CASE MANAGEMENT ════════════════════════════════════════════════════

const NOTE_CATEGORIES = ['housing', 'employment', 'treatment', 'transportation', 'life_skills', 'spiritual_support', 'legal', 'family', 'financial', 'general'] as const;
const CONTACT_TYPES = ['phone', 'in_person', 'email', 'text', 'video', 'other'] as const;
const NOTE_TEXT: Record<string, string> = {
  housing: 'Reviewed house expectations and room assignment. No concerns from house manager this week.',
  employment: 'Worked on resume and submitted two applications. Follow up on interview prep next visit.',
  treatment: 'Checked in on outpatient sessions — attending consistently and reports it is helping.',
  transportation: 'Arranged van pickup schedule for work shifts starting Monday.',
  life_skills: 'Completed budgeting worksheet; set a savings target for the deposit fund.',
  spiritual_support: 'Attended Bible study; connected with a local congregation near the house.',
  legal: 'Gathered paperwork for license reinstatement; court fee payment plan confirmed.',
  family: 'Facilitated a supervised call with family. Positive tone; will continue biweekly.',
  financial: 'Opened a checking account and set up direct deposit with employer.',
  general: 'Routine check-in. Stable week; no new needs identified.',
};

async function seedCaseManagement(
  participants: PRec[],
  template: TemplateInfo,
  users: SeedUsers,
  crm: CrmInfo,
): Promise<void> {
  const outside = participants.filter((p) => p.group === 'outside');
  const alumni = participants.filter((p) => p.group === 'alumni');
  const cmFor = (p: PRec) => p.caseManagerId ?? at(users.caseManagerIds, p.i);

  // Onboarding checklists instantiated from the template (varied completion)
  for (const p of outside) {
    const j = p.i - 12;
    const doneCount = j < 8 ? template.items.length : 4 + (j % 8);
    const checklist = await prisma.onboardingChecklist.create({
      data: {
        participantProfileId: p.profileId,
        templateId: template.id,
        startedAt: p.intakeDate,
        completedAt: doneCount >= template.items.length ? addDays(p.intakeDate, 30) : null,
        ...AUDIT,
        items: {
          create: template.items.map((it, idx) => ({
            label: it.label,
            sortOrder: it.sortOrder,
            required: true,
            templateItemId: it.id,
            status: idx < doneCount ? 'completed' : idx === doneCount ? 'in_progress' : 'pending',
            completedAt: idx < doneCount ? addDays(p.intakeDate, 5 + idx * 2) : null,
            completedById: idx < doneCount ? cmFor(p) : null,
          })),
        },
      },
    });
    void checklist;
  }

  // ~60 case notes (3 confidential)
  for (let n = 0; n < 60; n++) {
    const p = n % 10 === 7 ? at(alumni, n) : at(outside, n);
    const category = at(NOTE_CATEGORIES, n);
    const noteDate = daysAgo(2 + ((n * 3) % 170));
    const followUp = n % 5 === 0;
    await prisma.caseNote.create({
      data: {
        participantProfileId: p.profileId,
        caseManagerId: cmFor(p),
        noteDate,
        contactType: at(CONTACT_TYPES, n),
        category,
        content: NOTE_TEXT[category] ?? 'Routine check-in.',
        followUpRequired: followUp,
        followUpDate: followUp ? addDays(noteDate, 14) : null,
        followUpDoneAt: followUp && n % 10 === 0 ? addDays(noteDate, 12) : null,
        confidential: n === 5 || n === 23 || n === 41,
        ...AUDIT,
      },
    });
  }

  // ~25 case services
  const SERVICES = ['Bus pass provided', 'Clothing voucher issued', 'Hygiene kit provided', 'ID document fee paid', 'Grocery assistance', 'Work boots purchased', 'Phone minutes card', 'Gas card provided'];
  for (let s = 0; s < 25; s++) {
    const p = at(outside, s);
    await prisma.caseService.create({
      data: {
        participantProfileId: p.profileId,
        serviceType: at(SERVICES, s),
        serviceDate: daysAgo(5 + ((s * 7) % 150)),
        providerName: s % 3 === 0 ? 'Harvest Hands Food Bank' : 'JUMPSTART staff',
        description: 'Support service provided under the participant service plan.',
        outcome: s % 4 === 0 ? 'Need met — no further action' : 'Provided; monitoring',
        followUpRequired: s % 6 === 0,
        followUpDate: s % 6 === 0 ? daysFromNow(7 + s) : null,
        ...AUDIT,
      },
    });
  }

  // ~10 service plans with goals + milestones
  const goalIds: string[] = [];
  for (let g = 0; g < 10; g++) {
    const p = at(outside, g);
    const plan = await prisma.servicePlan.create({
      data: {
        participantProfileId: p.profileId,
        title: 'Re-Entry Service Plan',
        status: g < 8 ? 'active' : 'completed',
        reviewDate: daysFromNow(30 + g * 5),
        ...AUDIT,
      },
    });
    const goalSpecs = [
      { category: 'housing' as const, description: 'Secure independent housing within 9 months', status: g % 3 === 0 ? ('in_progress' as const) : ('not_started' as const) },
      { category: 'employment' as const, description: 'Obtain and keep full-time employment for 90 days', status: g % 2 === 0 ? ('in_progress' as const) : ('achieved' as const) },
      { category: 'financial' as const, description: 'Save $1,500 toward a rental deposit', status: 'in_progress' as const },
    ];
    for (let gi = 0; gi < (g % 2 === 0 ? 3 : 2); gi++) {
      const gs = at(goalSpecs, gi);
      const goal = await prisma.goal.create({
        data: {
          servicePlanId: plan.id,
          category: gs.category,
          description: gs.description,
          targetDate: addDays(p.intakeDate, 270),
          status: gs.status,
          ...AUDIT,
        },
      });
      goalIds.push(goal.id);
      await prisma.goalMilestone.create({
        data: {
          goalId: goal.id,
          description: gi === 0 ? 'Complete needs assessment and plan review' : 'First 30-day progress review',
          dueDate: addDays(p.intakeDate, 30 + gi * 30),
          completedAt: gs.status !== 'not_started' ? addDays(p.intakeDate, 28 + gi * 30) : null,
        },
      });
      if (gi === 1) {
        await prisma.goalMilestone.create({
          data: { goalId: goal.id, description: '60-day employer check-in', dueDate: addDays(p.intakeDate, 90) },
        });
      }
    }
  }

  // ~8 outbound referrals to partner vendors
  const referralReasons = ['Substance abuse treatment referral', 'Driver license reinstatement assistance', 'Emergency food assistance', 'Outpatient counseling referral'];
  const referralIds: string[] = [];
  for (let r = 0; r < 8; r++) {
    const p = at(outside, r * 2);
    const referral = await prisma.outboundReferral.create({
      data: {
        participantProfileId: p.profileId,
        vendorId: at(crm.referralPartnerIds, r),
        reason: at(referralReasons, r),
        referralDate: daysAgo(10 + r * 12),
        outcome: r % 3 === 0 ? 'Accepted — intake scheduled' : r % 3 === 1 ? 'Services started' : null,
        ...AUDIT,
      },
    });
    referralIds.push(referral.id);
  }

  // ~15 case tasks: 5 overdue, 5 upcoming, 5 completed
  const TASKS = ['Call employer to confirm start date', 'Schedule needs assessment review', 'Verify treatment attendance', 'Collect updated ID documents', 'Confirm housing payment plan', 'Follow up on referral outcome', 'Book DMV appointment', 'Review budget worksheet', 'Arrange transportation for work week', 'Check in with house manager'];
  for (let t = 0; t < 15; t++) {
    const p = at(outside, t);
    await prisma.caseTask.create({
      data: {
        title: at(TASKS, t),
        details: 'See most recent case note for context.',
        assignedToId: at(users.caseManagerIds, t),
        dueDate: t < 5 ? daysAgo(3 + t * 2) : t < 10 ? daysFromNow(2 + t) : daysAgo(20 + t),
        status: t < 10 ? (t % 4 === 1 ? 'in_progress' : 'open') : 'completed',
        completedAt: t >= 10 ? daysAgo(15 + t) : null,
        participantProfileId: p.profileId,
        goalId: t < 3 ? at(goalIds, t) : null,
        outboundReferralId: t === 5 ? at(referralIds, 0) : null,
        ...AUDIT,
      },
    });
  }

  // ~10 needs assessments with domain scores
  for (let a = 0; a < 10; a++) {
    const p = at(outside, a);
    await prisma.needsAssessment.create({
      data: {
        participantProfileId: p.profileId,
        instrumentName: 'JUMPSTART Needs Assessment v2',
        administeredAt: addDays(p.intakeDate, 7),
        administeredByName: a % 2 === 0 ? 'Rachel Whitfield' : 'Marcus Boone',
        domainScores: {
          housing: 1 + (a % 4),
          employment: 1 + ((a + 1) % 5),
          transportation: 1 + ((a + 2) % 3),
          treatment: 1 + ((a + 3) % 4),
          life_skills: 2 + (a % 3),
          social_support: 1 + ((a + 1) % 4),
        },
        summary: 'Primary needs identified in employment and transportation; housing stable in program.',
        ...AUDIT,
      },
    });
  }
}

// ═══ 12. VOLUNTEERS — profiles, checks, trainings, clearances, assignments ══

interface VolunteersInfo {
  /** Non-alumni volunteer profiles, in seed order (v0..v14). */
  profiles: { profileId: string; personId: string; firstName: string; lastName: string }[];
  /** The two alumni-mentor volunteer profiles (same Person as their participant record). */
  mentorProfiles: { profileId: string; personId: string; participant: PRec }[];
}

const VOL_NAMES: [string, string][] = [
  ['Walt', 'Pemberton'], ['Deb', 'Calloway'], ['Stan', 'Yoder'], ['Priscilla', 'Nash'],
  ['Gordon', 'Fetters'], ['Ida', 'Blankenship'], ['Roy', 'Colvin'], ['Marlene', 'Tackett'],
  ['Duane', 'Kessler'], ['Sylvia', 'Marchetti'], ['Ken', 'Ostrander'], ['Paula', 'Redding'],
  ['Vic', 'Templeton'], ['Norma', 'Applewhite'], ['Gene', 'Shackelford'],
];
const CHURCHES = ['First Covenant Church', 'Calvary Ridge Fellowship', 'Grace Point Community Church', 'New Song Chapel', 'Trinity Hills Church'];

async function seedVolunteers(
  participants: PRec[],
  institutions: InstitutionInfo[],
  classes: ClassInfo[],
  programs: ProgramInfo[],
  crm: CrmInfo,
): Promise<VolunteersInfo> {
  const activeClasses = classes.filter((c) => c.status === 'active');
  const profiles: VolunteersInfo['profiles'] = [];

  for (let v = 0; v < VOL_NAMES.length; v++) {
    const [firstName, lastName] = at(VOL_NAMES, v);
    const state = at(['TN', 'TN', 'SC', 'GA'], v);
    const person = await prisma.person.create({
      data: {
        firstName, lastName,
        gender: v % 2 === 0 ? 'male' : 'female',
        dateOfBirth: d(`${1955 + ((v * 3) % 40)}-${String((v % 12) + 1).padStart(2, '0')}-0${(v % 9) + 1}`),
        primaryPhone: phone(state, v + 5),
        primaryEmail: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.org`,
        addressLine1: `${900 + v * 17} ${at(['Hillsboro', 'Granada', 'Fairfax', 'Linden'], v)} Drive`,
        city: CITY[state], state, zip: `${37400 + v}`,
        emailOk: true,
        smsOk: v % 4 !== 3,
        smsConsentAt: v % 4 !== 3 ? d('2025-01-15') : null,
        ...AUDIT,
      },
    });
    const status = v < 10 ? 'active' : v < 13 ? 'applicant' : 'inactive';
    const profile = await prisma.volunteerProfile.create({
      data: {
        personId: person.id,
        status,
        volunteerRoles: v < 5 ? ['inside_class'] : v < 8 ? ['outside_class', 'bible_study'] : ['transportation', 'event'],
        availability: at(['Weeknights', 'Weekends', 'Tuesday and Thursday evenings', 'Flexible'], v),
        churchAffiliation: at(CHURCHES, v),
        ...AUDIT,
      },
    });
    profiles.push({ profileId: profile.id, personId: person.id, firstName, lastName });
  }
  const volAt = (n: number) => at(profiles, n);

  // Alumni-to-mentor: same Person carries participant AND volunteer profiles
  const mentorParticipants = [30, 32].map((i) => {
    const p = participants.find((x) => x.i === i);
    if (!p) throw new Error(`alumni ${i} missing`);
    return p;
  });
  const mentorProfiles: VolunteersInfo['mentorProfiles'] = [];
  for (const p of mentorParticipants) {
    const profile = await prisma.volunteerProfile.create({
      data: {
        personId: p.personId,
        status: 'active',
        isMentor: true,
        mentorStatus: 'Approved — outside programs only',
        volunteerRoles: ['mentoring'],
        availability: 'Weeknights',
        notes: 'JUMPSTART alumnus serving as a mentor.',
        ...AUDIT,
      },
    });
    mentorProfiles.push({ profileId: profile.id, personId: p.personId, participant: p });
  }

  // Background checks: mostly clear; one review, one pending; varied expirations
  const checkTargets = [...profiles.slice(0, 12), ...mentorProfiles.map((m) => ({ personId: m.personId }))];
  for (let c = 0; c < checkTargets.length; c++) {
    const target = at(checkTargets, c);
    const pending = c === 10;
    const review = c === 11;
    const completedAt = pending ? null : daysAgo(200 + c * 45);
    await prisma.backgroundCheck.create({
      data: {
        personId: target.personId,
        vendor: 'Sterling Volunteers',
        package: 'Volunteer Plus',
        orderedAt: daysAgo(210 + c * 45),
        completedAt,
        result: pending ? 'pending' : review ? 'review' : 'clear',
        // c === 3 expires within 30 days → renewal alert on the dashboard
        expiresAt: completedAt ? (c === 3 ? daysFromNow(21) : addDays(completedAt, 730)) : null,
        notes: review ? 'Flagged for coordinator review — awaiting adjudication.' : null,
        ...AUDIT,
      },
    });
  }

  // Trainings: orientation + PREA for active volunteers and mentors
  const trainingTargets = [...profiles.slice(0, 10), ...mentorProfiles];
  for (let t = 0; t < trainingTargets.length; t++) {
    const target = at(trainingTargets, t);
    await prisma.volunteerTraining.create({
      data: {
        volunteerProfileId: target.profileId,
        trainingType: 'orientation',
        completedAt: daysAgo(300 + t * 20),
        ...AUDIT,
      },
    });
    const preaDone = daysAgo(t === 5 ? 340 : 100 + t * 15);
    await prisma.volunteerTraining.create({
      data: {
        volunteerProfileId: target.profileId,
        trainingType: 'PREA awareness',
        completedAt: preaDone,
        expiresAt: t === 5 ? daysFromNow(25) : addDays(preaDone, 365),
        ...AUDIT,
      },
    });
  }

  // Clearances: inside-serving volunteers (v0–v4) vs their facility's requirements
  for (let v = 0; v < 5; v++) {
    const cls = at(activeClasses, v % activeClasses.length);
    const inst = institutions.find((x) => x.id === cls.institutionId);
    if (!inst) continue;
    for (let r = 0; r < inst.requirements.length; r++) {
      const req = at(inst.requirements, r);
      const expired = v === 4 && r === 1;
      const pending = v === 2 && r === inst.requirements.length - 1;
      const issuedAt = pending ? null : daysAgo(150 + r * 30 + v * 10);
      await prisma.volunteerClearance.create({
        data: {
          volunteerProfileId: volAt(v).profileId,
          requirementId: req.id,
          status: expired ? 'expired' : pending ? 'pending' : 'satisfied',
          issuedAt,
          expiresAt: expired
            ? daysAgo(10)
            : issuedAt && req.renewalMonths
              ? addDays(issuedAt, req.renewalMonths * 30)
              : null,
          ...AUDIT,
        },
      });
    }
  }

  // Assignments: inside classes, outside programs, mentoring, transportation, events
  for (let v = 0; v < 4; v++) {
    const cls = at(activeClasses, v);
    await prisma.volunteerAssignment.create({
      data: {
        volunteerProfileId: volAt(v).profileId,
        assignmentType: 'inside_class',
        institutionId: cls.institutionId,
        insideClassId: cls.id,
        role: 'Class facilitator',
        startDate: cls.startDate,
        status: 'active',
        ...AUDIT,
      },
    });
  }
  await prisma.volunteerAssignment.create({
    data: {
      volunteerProfileId: volAt(4).profileId,
      assignmentType: 'inside_class',
      institutionId: at(activeClasses, 0).institutionId,
      insideClassId: at(activeClasses, 0).id,
      role: 'Assistant facilitator',
      startDate: at(activeClasses, 0).startDate,
      status: 'active',
      clearanceOverride: true,
      clearanceOverrideReason: 'PREA renewal scheduled; approved by program director for this cohort.',
      ...AUDIT,
    },
  });
  for (let v = 5; v < 7; v++) {
    await prisma.volunteerAssignment.create({
      data: {
        volunteerProfileId: volAt(v).profileId,
        assignmentType: 'outside_class',
        outsideProgramId: at(programs, v - 4).id,
        role: v === 5 ? 'Volunteer lead' : 'Small-group leader',
        startDate: daysAgo(200),
        status: 'active',
        ...AUDIT,
      },
    });
  }
  await prisma.volunteerAssignment.create({
    data: {
      volunteerProfileId: volAt(7).profileId,
      assignmentType: 'transportation',
      outsideProgramId: at(programs, 5).id,
      role: 'Van driver',
      startDate: daysAgo(150),
      status: 'active',
      ...AUDIT,
    },
  });
  await prisma.volunteerAssignment.create({
    data: {
      volunteerProfileId: volAt(8).profileId,
      assignmentType: 'event',
      eventId: at(crm.events, 2).id, // upcoming graduation celebration
      role: 'Setup team',
      startDate: daysFromNow(17),
      status: 'proposed',
      ...AUDIT,
    },
  });
  await prisma.volunteerAssignment.create({
    data: {
      volunteerProfileId: volAt(9).profileId,
      assignmentType: 'event',
      eventId: at(crm.events, 0).id, // 2025 banquet — finished
      role: 'Greeter',
      startDate: d('2025-10-17'),
      endDate: d('2025-10-17'),
      status: 'completed',
      ...AUDIT,
    },
  });
  for (const m of mentorProfiles) {
    await prisma.volunteerAssignment.create({
      data: {
        volunteerProfileId: m.profileId,
        assignmentType: 'mentoring',
        role: 'Alumni mentor',
        startDate: daysAgo(120),
        status: 'active',
        ...AUDIT,
      },
    });
  }

  return { profiles, mentorProfiles };
}

// ═══ 13. MENTORING — screenings, assignments, sessions, alumni outcomes ═════

async function seedMentoring(
  participants: PRec[],
  volunteers: VolunteersInfo,
  mentorTemplate: TemplateInfo,
  users: SeedUsers,
): Promise<void> {
  const coordinator = users.byRole.volunteer_coordinator;
  const alumni = participants.filter((p) => p.group === 'alumni');
  const outside = participants.filter((p) => p.group === 'outside');

  // Approved screenings for the two alumni mentors (criteria snapshot completed)
  for (let m = 0; m < volunteers.mentorProfiles.length; m++) {
    const mentor = at(volunteers.mentorProfiles, m);
    await prisma.mentorScreening.create({
      data: {
        volunteerProfileId: mentor.profileId,
        stage: 'approved',
        templateId: mentorTemplate.id,
        approvedAt: daysAgo(140 - m * 10),
        approvedById: coordinator,
        conditions: 'Outside programs only',
        ...AUDIT,
        criteria: {
          create: mentorTemplate.items.map((it) => ({
            label: it.label,
            sortOrder: it.sortOrder,
            required: true,
            status: 'completed',
            completedAt: daysAgo(150 - m * 10),
            completedById: coordinator,
          })),
        },
        steps: {
          create: [
            { stage: 'applied', outcome: 'passed', completedAt: daysAgo(200 - m * 10) },
            { stage: 'interview', outcome: 'passed', completedAt: daysAgo(180 - m * 10) },
            { stage: 'panel_approval', outcome: 'passed', completedAt: daysAgo(140 - m * 10) },
          ],
        },
      },
    });
  }
  // One screening still in the pipeline (a non-alumni volunteer at interview stage)
  await prisma.mentorScreening.create({
    data: {
      volunteerProfileId: at(volunteers.profiles, 6).profileId,
      stage: 'interview',
      templateId: mentorTemplate.id,
      ...AUDIT,
      criteria: {
        create: mentorTemplate.items.map((it, idx) => ({
          label: it.label,
          sortOrder: it.sortOrder,
          required: true,
          status: idx < 2 ? 'completed' : 'pending',
          completedAt: idx < 2 ? daysAgo(20) : null,
          completedById: idx < 2 ? coordinator : null,
        })),
      },
      steps: { create: [{ stage: 'applied', outcome: 'passed', completedAt: daysAgo(30) }] },
    },
  });

  // Mentor assignments: 2 active + 1 ended
  const assignmentIds: string[] = [];
  for (let m = 0; m < 2; m++) {
    const mentor = at(volunteers.mentorProfiles, m);
    const mentee = at(outside, m * 4 + 1);
    const assignment = await prisma.mentorAssignment.create({
      data: {
        mentorProfileId: mentor.profileId,
        participantProfileId: mentee.profileId,
        matchedById: coordinator,
        startDate: daysAgo(100 - m * 20),
        status: 'active',
        meetingCadence: m === 0 ? 'weekly' : 'biweekly',
        matchRationale: 'Shared background and same home city; mentor completed the same inside program.',
        ...AUDIT,
      },
    });
    assignmentIds.push(assignment.id);
  }
  const withdrawnMentee = participants.find((p) => p.i === 40); // withdrew from the program
  if (withdrawnMentee) {
    await prisma.mentorAssignment.create({
      data: {
        mentorProfileId: at(volunteers.mentorProfiles, 0).profileId,
        participantProfileId: withdrawnMentee.profileId,
        matchedById: coordinator,
        startDate: addDays(withdrawnMentee.intakeDate, 20),
        endDate: addDays(withdrawnMentee.intakeDate, 70),
        status: 'ended',
        endReason: 'Mentee withdrew from the outside program',
        meetingCadence: 'weekly',
        ...AUDIT,
      },
    });
  }

  // ~8 session logs across the two active matches; one escalated concern
  const MODES = ['in_person', 'phone', 'video'] as const;
  for (let s = 0; s < 8; s++) {
    await prisma.mentorSessionLog.create({
      data: {
        mentorAssignmentId: at(assignmentIds, s % 2),
        sessionDate: daysAgo(90 - s * 11),
        mode: at(MODES, s),
        durationMinutes: 45 + (s % 3) * 15,
        participantProgress: s === 5 ? 'struggling' : at(['improving', 'steady', 'improving'] as const, s),
        concernsEscalated: s === 5,
        notes: s === 5
          ? 'Mentee missed work twice this week and seemed withdrawn — escalated to case manager same day.'
          : 'Met as planned. Worked through this week\'s goals and prayed together.',
        ...AUDIT,
      },
    });
  }

  // ~15 alumni engagements
  const ENGAGEMENTS = ['event_attendance', 'check_in_call', 'volunteer_service', 'gave_testimony', 'donated', 'newsletter'] as const;
  for (let e = 0; e < 15; e++) {
    const p = at(alumni, e);
    await prisma.alumniEngagement.create({
      data: {
        participantProfileId: p.profileId,
        engagementType: at(ENGAGEMENTS, e),
        engagementDate: daysAgo(10 + ((e * 23) % 400)),
        notes: e % 4 === 0 ? 'Connected at the alumni table during the banquet.' : null,
        ...AUDIT,
      },
    });
  }

  // Outcome check-ins: 5 waves per alumnus relative to graduation
  const WAVES = [
    { wave: 'day_30' as const, offset: 30 },
    { wave: 'month_6' as const, offset: 182 },
    { wave: 'month_12' as const, offset: 365 },
    { wave: 'month_24' as const, offset: 730 },
    { wave: 'month_36' as const, offset: 1095 },
  ];
  const METHODS = ['call', 'sms', 'in_person', 'event', 'self_report'] as const;
  for (let k = 0; k < alumni.length; k++) {
    const p = at(alumni, k);
    const grad = p.graduationDate ?? TODAY;
    const lostToFollowUp = k === 5;
    const reincarcerated = k === 7; // verified at the month_6 wave
    for (let w = 0; w < WAVES.length; w++) {
      const { wave, offset } = at(WAVES, w);
      const dueDate = addDays(grad, offset);
      const isPast = dueDate < daysAgo(14);
      if (!isPast) {
        await prisma.outcomeCheckin.create({
          data: { participantProfileId: p.profileId, wave, dueDate, ...AUDIT },
        });
        continue;
      }
      const incarceratedNow = reincarcerated && w >= 1;
      await prisma.outcomeCheckin.create({
        data: {
          participantProfileId: p.profileId,
          wave,
          dueDate,
          completedDate: min(addDays(dueDate, 2 + (k % 7)), daysAgo(1)),
          method: lostToFollowUp ? 'call' : at(METHODS, k + w),
          collectedById: at(users.caseManagerIds, k),
          employmentStatus: lostToFollowUp ? 'unknown' : incarceratedNow ? 'unable' : at(['employed_ft', 'employed_ft', 'employed_pt', 'seeking'] as const, k + w),
          housingStatus: lostToFollowUp ? 'unknown' : incarceratedNow ? 'incarcerated' : at(['stable', 'stable', 'transitional'] as const, k + w),
          reArrested: lostToFollowUp ? null : incarceratedNow,
          reArrestedVerification: lostToFollowUp ? null : 'self_reported',
          reIncarcerated: lostToFollowUp ? null : incarceratedNow,
          reIncarceratedVerification: lostToFollowUp ? null : incarceratedNow ? 'staff_verified' : 'self_reported',
          justiceNotes: incarceratedNow ? 'Re-incarceration confirmed by staff with the supervising officer.' : null,
          notes: lostToFollowUp ? 'Unable to reach after three attempts — lost to follow-up.' : null,
          ...AUDIT,
        },
      });
    }
  }
}

// ═══ 15. EMPLOYERS + EMPLOYMENT HISTORY ═════════════════════════════════════

async function seedEmployment(participants: PRec[], users: SeedUsers): Promise<void> {
  const employerSpecs: { name: string; industry: string; hiring: 'prospect' | 'partner' | 'actively_hiring' | 'paused' | 'inactive'; state: string; contact: string }[] = [
    { name: 'Volunteer State Concrete', industry: 'Construction', hiring: 'actively_hiring', state: 'TN', contact: 'Dale Whitmore' },
    { name: 'Cumberland Pallet Works', industry: 'Manufacturing', hiring: 'actively_hiring', state: 'TN', contact: 'Renee Vickers' },
    { name: 'Smoky Mountain Logistics', industry: 'Warehousing & Logistics', hiring: 'actively_hiring', state: 'TN', contact: 'Terry Oakes' },
    { name: 'Magnolia Diner Group', industry: 'Food Service', hiring: 'partner', state: 'TN', contact: 'Bess Harmon' },
    { name: 'Palmetto Grounds Landscaping', industry: 'Landscaping', hiring: 'partner', state: 'SC', contact: 'Jorge Cepeda' },
    { name: 'Peach State Powder Coating', industry: 'Manufacturing', hiring: 'paused', state: 'GA', contact: 'Al Brantley' },
    { name: 'RiverTown Moving Co.', industry: 'Moving & Storage', hiring: 'prospect', state: 'TN', contact: 'Casey Drummond' },
    { name: 'Hickory Ridge Cabinetry', industry: 'Woodworking', hiring: 'partner', state: 'TN', contact: 'Sam Petit' },
  ];
  const employers: { id: string }[] = [];
  for (let i = 0; i < employerSpecs.length; i++) {
    const s = at(employerSpecs, i);
    const employer = await prisma.employer.create({
      data: {
        name: s.name, contactPerson: s.contact, phone: phone(s.state, i + 15),
        email: `employer${i + 1}@example.org`,
        addressLine1: `${700 + i * 23} Industrial Parkway`, city: CITY[s.state], state: s.state, zip: `${37500 + i}`,
        industry: s.industry, hiringStatus: s.hiring, ...AUDIT,
      },
    });
    employers.push({ id: employer.id });
  }
  const empAt = (n: number) => at(employers, n);
  const pByIdx = (i: number) => {
    const p = participants.find((x) => x.i === i);
    if (!p) throw new Error(`participant ${i} missing`);
    return p;
  };

  type EmpStatus = 'applied' | 'interviewing' | 'hired' | 'active' | 'terminated' | 'resigned' | 'completed';
  const records: { pi: number; employer: number; title: string; status: EmpStatus; startOffset: number; endOffset?: number; pay?: number; hours?: number }[] = [
    // Outside-active participants
    { pi: 13, employer: 0, title: 'Concrete Laborer', status: 'active', startOffset: 30, pay: 19.5, hours: 40 },
    { pi: 14, employer: 1, title: 'Pallet Assembler', status: 'active', startOffset: 35, pay: 16.0, hours: 40 },
    { pi: 15, employer: 2, title: 'Warehouse Associate', status: 'active', startOffset: 40, pay: 17.25, hours: 36 },
    { pi: 16, employer: 3, title: 'Line Cook', status: 'active', startOffset: 28, pay: 15.5, hours: 32 },
    { pi: 17, employer: 4, title: 'Landscaping Crew Member', status: 'terminated', startOffset: 25, endOffset: 95, pay: 15.0, hours: 40 },
    { pi: 18, employer: 2, title: 'Forklift Operator', status: 'applied', startOffset: 10 },
    { pi: 19, employer: 0, title: 'Form Setter', status: 'interviewing', startOffset: 12 },
    { pi: 20, employer: 7, title: 'Cabinet Shop Helper', status: 'active', startOffset: 45, pay: 18.0, hours: 40 },
    { pi: 21, employer: 1, title: 'Machine Tender', status: 'resigned', startOffset: 20, endOffset: 80, pay: 16.5, hours: 40 },
    { pi: 22, employer: 6, title: 'Moving Crew', status: 'interviewing', startOffset: 15 },
    { pi: 23, employer: 3, title: 'Dishwasher', status: 'applied', startOffset: 8 },
    // Alumni — including one with a completed earlier job plus a current one
    { pi: 31, employer: 2, title: 'Shift Lead', status: 'active', startOffset: 60, pay: 21.0, hours: 40 },
    { pi: 33, employer: 5, title: 'Powder Coat Technician', status: 'completed', startOffset: 30, endOffset: 260, pay: 17.0, hours: 40 },
    { pi: 33, employer: 7, title: 'Finish Carpenter Apprentice', status: 'active', startOffset: 280, pay: 20.0, hours: 40 },
  ];

  for (const r of records) {
    const p = pByIdx(r.pi);
    const anchor = p.intakeDate;
    const applied = addDays(anchor, r.startOffset - 21);
    const hiredDate = addDays(anchor, r.startOffset);
    const endDate = r.endOffset !== undefined ? addDays(anchor, r.endOffset) : null;
    const hiredPlus = r.status !== 'applied' && r.status !== 'interviewing';
    const employment = await prisma.participantEmployment.create({
      data: {
        participantProfileId: p.profileId,
        employerId: empAt(r.employer).id,
        jobTitle: r.title,
        startDate: hiredPlus ? hiredDate : null,
        endDate,
        status: r.status,
        payRate: hiredPlus ? r.pay ?? null : null,
        payPeriod: 'hourly',
        hoursPerWeek: hiredPlus ? r.hours ?? null : null,
        supervisorName: hiredPlus ? 'Site Supervisor' : null,
        supervisorPhone: hiredPlus ? phone(p.state, r.pi + 90) : null,
        ...AUDIT,
      },
    });

    // Ascending status-history chain
    const chain: { from: EmpStatus | null; to: EmpStatus; date: Date }[] = [
      { from: null, to: 'applied', date: applied },
    ];
    if (r.status !== 'applied') chain.push({ from: 'applied', to: 'interviewing', date: addDays(applied, 7) });
    if (hiredPlus) {
      chain.push({ from: 'interviewing', to: 'hired', date: addDays(applied, 18) });
      chain.push({ from: 'hired', to: 'active', date: hiredDate });
    }
    if (r.status === 'terminated' || r.status === 'resigned' || r.status === 'completed') {
      chain.push({ from: 'active', to: r.status, date: endDate ?? addDays(hiredDate, 60) });
    }
    await prisma.employmentStatusHistory.createMany({
      data: chain.map((c) => ({
        employmentId: employment.id,
        fromStatus: c.from,
        toStatus: c.to,
        effectiveDate: c.date,
        changedById: users.byRole.employment_coordinator,
      })),
    });
  }
}

// ═══ 16. FLEET — vehicles + maintenance ═════════════════════════════════════

async function seedFleet(crm: CrmInfo): Promise<void> {
  const vehicleSpecs = [
    // registration expiring within 30 days → dashboard alert
    { make: 'Ford', model: 'Transit 350', year: 2019, color: 'White', plate: '4JS-821', vin: '1FTBW3XM5KKA10234', mileage: 91200, loc: 'Nashville, TN', active: true, reg: daysFromNow(20), ins: d('2026-12-15') },
    // insurance already expired → dashboard alert
    { make: 'Ram', model: 'ProMaster 2500', year: 2021, color: 'Silver', plate: '7KD-114', vin: '3C6TRVDG8ME510442', mileage: 58400, loc: 'Nashville, TN', active: true, reg: d('2027-01-31'), ins: daysAgo(15) },
    { make: 'Chevrolet', model: 'Express 3500', year: 2015, color: 'Blue', plate: '2QN-905', vin: '1GAZGPFG1F1210087', mileage: 168000, loc: 'Columbia, SC', active: false, reg: d('2025-11-30'), ins: d('2025-11-30') },
    { make: 'Ford', model: 'F-150', year: 2017, color: 'Gray', plate: '9RC-233', vin: '1FTEW1EG3HFA55219', mileage: 122500, loc: 'Atlanta, GA', active: true, reg: d('2026-10-31'), ins: d('2026-09-30') },
    { make: 'Toyota', model: 'Sienna', year: 2024, color: 'White', plate: '5TW-078', vin: '5TDKRKEC2RS114630', mileage: 18900, loc: 'Nashville, TN', active: true, reg: d('2027-03-31'), ins: d('2027-02-28') },
  ];
  const vehicles: { id: string; mileage: number }[] = [];
  for (const s of vehicleSpecs) {
    const v = await prisma.vehicle.create({
      data: {
        make: s.make, model: s.model, year: s.year, color: s.color,
        licensePlate: s.plate, vin: s.vin, mileage: s.mileage,
        assignedLocation: s.loc, active: s.active,
        registrationExpiration: s.reg, insuranceExpiration: s.ins,
        notes: s.active ? null : 'Retired from service — awaiting sale.',
        ...AUDIT,
      },
    });
    vehicles.push({ id: v.id, mileage: s.mileage });
  }
  const vehAt = (n: number) => at(vehicles, n);

  const TYPES = ['Oil change', 'Tire rotation', 'Brake service', 'Transmission service', 'Battery replacement', 'State inspection'];
  for (let m = 0; m < 12; m++) {
    const vi = m % 5;
    const veh = vehAt(vi);
    // m === 0: next service due date within 2 weeks → alert
    // m === 1: next service due mileage (90,000) below vehicle 0's current 91,200 → alert
    const target = m === 1 ? vehAt(0) : veh;
    await prisma.vehicleMaintenanceRecord.create({
      data: {
        vehicleId: target.id,
        maintenanceDate: daysAgo(20 + m * 28),
        maintenanceType: at(TYPES, m),
        mileageAtService: Math.max(1000, target.mileage - 1500 - m * 900),
        vendorId: at(crm.autoShopIds, m),
        cost: [89.5, 145, 420, 1180, 210, 65, 89.5, 300, 96, 540, 132, 75][m] ?? 100,
        description: 'Routine fleet maintenance per service schedule.',
        nextServiceDueDate: m === 0 ? daysFromNow(10) : m % 4 === 2 ? daysFromNow(90 + m * 10) : null,
        nextServiceDueMileage: m === 1 ? 90000 : null,
        ...AUDIT,
      },
    });
  }
}

// ═══ 17. COMMUNICATIONS — templates + message history ═══════════════════════

async function seedCommunications(
  participants: PRec[],
  volunteers: VolunteersInfo,
  users: SeedUsers,
): Promise<void> {
  const emailTemplate = await prisma.communicationTemplate.create({
    data: {
      name: 'Alumni Welcome Email',
      channel: 'email',
      subject: 'Welcome to the JUMPSTART Alumni Family, {{firstName}}!',
      body: 'Dear {{firstName}},\n\nCongratulations on your graduation! You are now part of the JUMPSTART alumni family. Watch for alumni gatherings, mentoring opportunities, and check-in calls from your case manager.\n\nWith you always,\nThe JUMPSTART USA Team',
      ...AUDIT,
    },
  });
  const smsTemplate = await prisma.communicationTemplate.create({
    data: {
      name: 'Check-In Reminder SMS',
      channel: 'sms',
      body: '{{firstName}}, this is {{caseManager}} with JUMPSTART. Just checking in — reply with how work and housing are going this week, or call the office. Reply STOP to opt out.',
      ...AUDIT,
    },
  });
  const letterTemplate = await prisma.communicationTemplate.create({
    data: {
      name: 'Inside Encouragement Letter',
      channel: 'letter',
      body: 'Dear {{firstName}},\n\nAll of us at JUMPSTART are proud of the work you are doing in {{className}} at {{facilityName}}. Keep pressing on — we are preparing for your arrival on the outside.\n\nSincerely,\n{{staffName}}\nJUMPSTART USA',
      ...AUDIT,
    },
  });

  const alumni = participants.filter((p) => p.group === 'alumni');
  const outside = participants.filter((p) => p.group === 'outside');
  const inside = participants.filter((p) => p.group === 'inside');

  // 4 alumni welcome emails (delivered/sent) + 1 failed email
  for (let m = 0; m < 4; m++) {
    const p = at(alumni, m);
    await prisma.communication.create({
      data: {
        personId: p.personId,
        channel: 'email',
        templateId: emailTemplate.id,
        subject: `Welcome to the JUMPSTART Alumni Family, ${p.firstName}!`,
        body: `Dear ${p.firstName}, congratulations on your graduation...`,
        status: m % 2 === 0 ? 'delivered' : 'sent',
        sentById: at(users.caseManagerIds, m),
        sentAt: addDays(p.graduationDate ?? TODAY, 2),
      },
    });
  }
  await prisma.communication.create({
    data: {
      personId: at(alumni, 5).personId,
      channel: 'email',
      templateId: emailTemplate.id,
      subject: 'Welcome to the JUMPSTART Alumni Family!',
      body: 'Dear friend, congratulations on your graduation...',
      status: 'failed',
      statusDetail: 'Mailbox does not exist (550 5.1.1)',
      sentById: at(users.caseManagerIds, 0),
      sentAt: daysAgo(40),
    },
  });
  // 3 check-in SMS to outside-active participants with SMS consent
  for (let m = 0; m < 3; m++) {
    const p = at(outside, m * 3);
    await prisma.communication.create({
      data: {
        personId: p.personId,
        channel: 'sms',
        templateId: smsTemplate.id,
        body: `${p.firstName}, this is Rachel with JUMPSTART. Just checking in — how are work and housing going this week? Reply STOP to opt out.`,
        status: 'delivered',
        relatedEntityType: 'outcome_checkin',
        sentById: at(users.caseManagerIds, m),
        sentAt: daysAgo(5 + m * 9),
      },
    });
  }
  // 2 letters to inside participants — one delivered, one returned
  for (let m = 0; m < 2; m++) {
    const p = at(inside, m * 4);
    await prisma.communication.create({
      data: {
        personId: p.personId,
        channel: 'letter',
        templateId: letterTemplate.id,
        body: `Dear ${p.firstName}, all of us at JUMPSTART are proud of the work you are doing...`,
        status: m === 1 ? 'returned' : 'sent',
        statusDetail: m === 1 ? 'Returned to sender — participant transferred to another facility' : null,
        sentById: users.byRole.inside_program_staff,
        sentAt: daysAgo(30 + m * 10),
      },
    });
  }
  // 1 volunteer email
  await prisma.communication.create({
    data: {
      personId: at(volunteers.profiles, 0).personId,
      channel: 'email',
      subject: 'Thank you for serving this quarter',
      body: 'Walt, thank you for faithfully facilitating at Cumberland Ridge this quarter...',
      status: 'delivered',
      sentById: users.byRole.volunteer_coordinator,
      sentAt: daysAgo(12),
    },
  });
}

// ═══ 18. PUBLIC INTAKE QUEUES ═══════════════════════════════════════════════

async function seedIntakeQueues(
  participants: PRec[],
  volunteers: VolunteersInfo,
  users: SeedUsers,
): Promise<void> {
  // 4 volunteer applications: 2 pending, 1 approved (linked person), 1 spam
  await prisma.volunteerApplication.create({
    data: {
      submittedAt: daysAgo(3),
      firstName: 'Corinne', lastName: 'Vestal',
      email: 'corinne.vestal@example.org', phone: phone('TN', 91),
      city: 'Nashville', state: 'TN',
      interestAreas: ['mentoring', 'bible_study'],
      availability: 'Weeknights',
      churchAffiliation: 'New Song Chapel',
      message: 'I have served in jail ministry before and would love to help.',
      consentAt: daysAgo(3),
      status: 'pending',
    },
  });
  await prisma.volunteerApplication.create({
    data: {
      submittedAt: daysAgo(1),
      firstName: 'Hank', lastName: 'Ledoux',
      email: 'hank.ledoux@example.org', phone: phone('SC', 92),
      city: 'Columbia', state: 'SC',
      interestAreas: ['transportation'],
      availability: 'Saturdays',
      consentAt: daysAgo(1),
      status: 'pending',
    },
  });
  const approvedVol = at(volunteers.profiles, 9);
  await prisma.volunteerApplication.create({
    data: {
      submittedAt: daysAgo(60),
      firstName: approvedVol.firstName, lastName: approvedVol.lastName,
      email: `${approvedVol.firstName.toLowerCase()}.${approvedVol.lastName.toLowerCase()}@example.org`,
      city: 'Nashville', state: 'TN',
      interestAreas: ['event'],
      consentAt: daysAgo(60),
      status: 'approved',
      reviewedById: users.byRole.volunteer_coordinator,
      reviewedAt: daysAgo(55),
      reviewNotes: 'Approved — onboarded as event volunteer.',
      linkedPersonId: approvedVol.personId,
    },
  });
  await prisma.volunteerApplication.create({
    data: {
      submittedAt: daysAgo(2),
      firstName: 'Best', lastName: 'Deals',
      email: 'promo@example.org',
      message: 'CHEAP WEB TRAFFIC — visit our site for guaranteed rankings!!!',
      status: 'spam',
      reviewedById: users.byRole.admin,
      reviewedAt: daysAgo(2),
    },
  });

  // 5 referral inbox items: 3 pending (one 5+ days old for SLA), 1 approved, 1 rejected
  await prisma.referralInboxItem.create({
    data: {
      submittedAt: daysAgo(6), // SLA breach test — pending more than 5 days
      referrerType: 'chaplain',
      referrerName: 'Rev. Harold Bright', referrerEmail: 'chaplain.tn0@example.org',
      subjectFirstName: 'Dewayne', subjectLastName: 'Marsh',
      facilityName: 'Cumberland Ridge Correctional Facility', state: 'TN',
      expectedReleaseDate: daysFromNow(90),
      needs: 'Releasing in about 90 days. Needs housing and treatment referral on release.',
      status: 'pending',
    },
  });
  await prisma.referralInboxItem.create({
    data: {
      submittedAt: daysAgo(2),
      referrerType: 'family',
      referrerName: 'Alma Statler', referrerPhone: phone('TN', 93),
      subjectFirstName: 'Reggie', subjectLastName: 'Statler',
      state: 'TN',
      needs: 'My son comes home next month and needs a program and a place to stay.',
      status: 'pending',
    },
  });
  await prisma.referralInboxItem.create({
    data: {
      submittedAt: daysAgo(1),
      referrerType: 'self',
      subjectFirstName: 'Curtis', subjectLastName: 'Pham',
      subjectPhone: phone('GA', 94), state: 'GA',
      needs: 'Released two weeks ago. Looking for work help and a Bible study.',
      status: 'pending',
    },
  });
  const linkedParticipant = participants.find((p) => p.i === 43);
  await prisma.referralInboxItem.create({
    data: {
      submittedAt: daysAgo(25),
      referrerType: 'agency',
      referrerName: 'TN Probation & Parole — District 5',
      subjectFirstName: linkedParticipant?.firstName ?? 'Nathan',
      subjectLastName: linkedParticipant?.lastName ?? 'Trudeau',
      state: 'TN',
      expectedReleaseDate: daysAgo(12),
      needs: 'Referral for transitional housing and case management on release.',
      status: 'approved',
      reviewedById: at(users.caseManagerIds, 0),
      reviewedAt: daysAgo(14),
      reviewNotes: 'Approved — intake completed and housed.',
      linkedParticipantProfileId: linkedParticipant?.profileId ?? null,
    },
  });
  await prisma.referralInboxItem.create({
    data: {
      submittedAt: daysAgo(20),
      referrerType: 'other',
      referrerName: 'Anonymous',
      subjectFirstName: 'Unknown', subjectLastName: 'Person',
      needs: 'Vague request with no contact information provided.',
      status: 'rejected',
      reviewedById: at(users.caseManagerIds, 1),
      reviewedAt: daysAgo(18),
      reviewNotes: 'Not actionable — no way to reach the referrer or subject.',
    },
  });

  // 2 alumni form tokens (one used) + 1 pending alumni update
  const alumniUsed = participants.find((p) => p.i === 31);
  const alumniPending = participants.find((p) => p.i === 33);
  if (alumniUsed) {
    await prisma.alumniFormToken.create({
      data: {
        participantProfileId: alumniUsed.profileId,
        token: 'seed-alumni-token-used-0001',
        expiresAt: daysFromNow(14),
        usedAt: daysAgo(4),
      },
    });
    await prisma.alumniUpdate.create({
      data: {
        participantProfileId: alumniUsed.profileId,
        submittedAt: daysAgo(4),
        employmentStatus: 'employed_ft',
        housingStatus: 'stable',
        newPhone: phone(alumniUsed.state, 95),
        message: 'Got promoted to shift lead last month. Church family is great.',
        status: 'pending',
      },
    });
  }
  if (alumniPending) {
    await prisma.alumniFormToken.create({
      data: {
        participantProfileId: alumniPending.profileId,
        token: 'seed-alumni-token-open-0002',
        expiresAt: daysFromNow(10),
      },
    });
  }
}

// ═══ 19. COMPLIANCE & SETTINGS ══════════════════════════════════════════════

async function seedCompliance(participants: PRec[], users: SeedUsers): Promise<void> {
  const tnDsa = await prisma.dataSharingAgreement.create({
    data: {
      stateOrAgency: 'Tennessee Department of Correction',
      effectiveDate: d('2024-07-01'),
      expiryDate: d('2027-06-30'),
      permittedUses: 'Program eligibility verification and outcome reporting.',
      reDisclosureRestrictions: 'No re-disclosure without written TDOC approval.',
      requiredSafeguards: 'Role-based access; DOC fields limited to fields.justice.read holders.',
      active: true,
      ...AUDIT,
    },
  });
  const scDsa = await prisma.dataSharingAgreement.create({
    data: {
      stateOrAgency: 'South Carolina Department of Corrections',
      effectiveDate: d('2024-09-01'),
      expiryDate: daysFromNow(45), // expiring within 60 days → compliance alert
      permittedUses: 'Volunteer clearance coordination and release planning.',
      reDisclosureRestrictions: 'Aggregate reporting only; no individual-level re-disclosure.',
      requiredSafeguards: 'Annual staff training; audit logging of DOC-sourced records.',
      purgeOnTermination: true,
      active: true,
      ...AUDIT,
    },
  });
  // Link a couple of DOC ids to the agreements they arrived under
  const tnDoc = await prisma.participantDocId.findFirst({ where: { state: 'TN' } });
  if (tnDoc) {
    await prisma.participantDocId.update({
      where: { id: tnDoc.id },
      data: { dataSharingAgreementId: tnDsa.id, source: 'doc', updatedById: AUDIT.updatedById },
    });
  }
  const scDoc = await prisma.participantDocId.findFirst({ where: { state: 'SC' } });
  if (scDoc) {
    await prisma.participantDocId.update({
      where: { id: scDoc.id },
      data: { dataSharingAgreementId: scDsa.id, source: 'doc', updatedById: AUDIT.updatedById },
    });
  }

  await prisma.appSetting.createMany({
    data: [
      {
        key: 'org.info',
        value: {
          name: 'JUMPSTART USA',
          address: '1000 Ministry Way, Nashville, TN 37200',
          ein: '00-0000000',
          phone: '615-555-0100',
        },
        updatedById: users.adminId,
      },
      { key: 'mentoring.maxActiveMentees', value: 2, updatedById: users.adminId },
      // The six JUMPSTART state chapters (jumpstartvision.org)
      {
        key: 'states.active',
        value: ['FL', 'GA', 'NC', 'OH', 'SC', 'TX'],
        updatedById: users.adminId,
      },
    ],
  });

  const consentAlumnus = participants.find((p) => p.i === 34);
  if (consentAlumnus) {
    await prisma.testimonyConsent.create({
      data: {
        personId: consentAlumnus.personId,
        scope: 'newsletter',
        grantedAt: daysAgo(90),
        notes: 'Consented to sharing first name and story in the quarterly newsletter.',
        ...AUDIT,
      },
    });
  }

  await prisma.syncRun.create({
    data: {
      target: 'bloomerang',
      startedAt: addDays(daysAgo(1), 0),
      finishedAt: addDays(daysAgo(1), 0),
      status: 'success',
      stats: { donorsCreated: 12, donorsUpdated: 0, donationsCreated: 35, donationsUpdated: 0, skipped: 3 },
    },
  });
}

// ═══ 20. AUDIT LOG SAMPLES ══════════════════════════════════════════════════

async function seedAuditLog(participants: PRec[], users: SeedUsers): Promise<void> {
  const p0 = at(participants, 12);
  await prisma.auditLog.createMany({
    data: [
      { userId: users.adminId, action: 'login', entityType: 'user', entityId: users.adminId, metadata: { ip: '203.0.113.10' }, createdAt: daysAgo(0) },
      { userId: at(users.caseManagerIds, 0), action: 'login', entityType: 'user', entityId: at(users.caseManagerIds, 0), metadata: { ip: '203.0.113.24' }, createdAt: daysAgo(1) },
      { userId: at(users.caseManagerIds, 0), action: 'create', entityType: 'participant_profile', entityId: p0.profileId, newValues: { participantNumber: 'seeded', outsideStatus: 'intake' }, createdAt: daysAgo(30) },
      { userId: at(users.caseManagerIds, 0), action: 'update', entityType: 'participant_profile', entityId: p0.profileId, oldValues: { outsideStatus: 'intake' }, newValues: { outsideStatus: 'active' }, createdAt: daysAgo(16) },
      { userId: at(users.caseManagerIds, 1), action: 'read_confidential', entityType: 'case_note', metadata: { reason: 'assigned case manager' }, createdAt: daysAgo(3) },
      { userId: users.byRole.executive, action: 'export', entityType: 'report', metadata: { report: 'participant_status_summary', format: 'csv' }, createdAt: daysAgo(5) },
      { userId: users.adminId, action: 'permission_change', entityType: 'user', entityId: at(users.caseManagerIds, 1), newValues: { roleAdded: 'case_manager' }, createdAt: daysAgo(45) },
    ],
  });
}

// ═══ MAIN ═══════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  if (process.env.RESEED === '1') {
    await wipe();
  } else if ((await prisma.role.count()) > 0) {
    console.log('Database already seeded — nothing to do. (Set RESEED=1 to wipe and reseed in dev.)');
    return;
  }

  console.log('Seeding JUMPSTART USA demo data...');
  const roleIdByKey = await seedRbac();
  const users = await seedUsers(roleIdByKey);
  AUDIT = { createdById: users.adminId, updatedById: users.adminId };

  const onboardingTemplate = await seedOnboardingTemplate();
  const mentorTemplate = await seedMentorTemplate();
  const institutions = await seedInstitutions();
  const classes = await seedInsideClasses(institutions, users.byRole.inside_program_staff);
  const participants = await seedParticipants(users.caseManagerIds);
  await seedInsideEnrollments(participants, classes);
  const programs = await seedOutsidePrograms(users, participants);
  await seedHousing(participants);
  const crm = await seedCrm(participants, users); // before case mgmt (vendors) & volunteers (events)
  await seedCaseManagement(participants, onboardingTemplate, users, crm);
  const volunteers = await seedVolunteers(participants, institutions, classes, programs, crm);
  await seedMentoring(participants, volunteers, mentorTemplate, users);
  await seedEmployment(participants, users);
  await seedFleet(crm);
  await seedCommunications(participants, volunteers, users);
  await seedIntakeQueues(participants, volunteers, users);
  await seedCompliance(participants, users);
  await seedCaseManagementSamples(prisma, users.adminId);
  await seedAuditLog(participants, users);

  const counts: [string, number][] = [
    ['permissions', await prisma.permission.count()],
    ['roles', await prisma.role.count()],
    ['users', await prisma.user.count()],
    ['persons', await prisma.person.count()],
    ['participants', await prisma.participantProfile.count()],
    ['status history rows', await prisma.participantStatusHistory.count()],
    ['institutions', await prisma.institution.count()],
    ['inside classes', await prisma.insideClass.count()],
    ['inside enrollments', await prisma.insideClassEnrollment.count()],
    ['outside programs', await prisma.outsideProgram.count()],
    ['outside enrollments', await prisma.outsideProgramEnrollment.count()],
    ['transitional homes', await prisma.transitionalHome.count()],
    ['housing enrollments', await prisma.housingEnrollment.count()],
    ['case notes', await prisma.caseNote.count()],
    ['case services', await prisma.caseService.count()],
    ['service plans', await prisma.servicePlan.count()],
    ['case tasks', await prisma.caseTask.count()],
    ['volunteers', await prisma.volunteerProfile.count()],
    ['mentor assignments', await prisma.mentorAssignment.count()],
    ['outcome check-ins', await prisma.outcomeCheckin.count()],
    ['donors', await prisma.donor.count()],
    ['donations', await prisma.donation.count()],
    ['events', await prisma.event.count()],
    ['employers', await prisma.employer.count()],
    ['employment records', await prisma.participantEmployment.count()],
    ['vehicles', await prisma.vehicle.count()],
    ['maintenance records', await prisma.vehicleMaintenanceRecord.count()],
    ['communications', await prisma.communication.count()],
    ['audit log rows', await prisma.auditLog.count()],
  ];
  console.log('\nSeed complete:');
  for (const [label, n] of counts) console.log(`  ${label.padEnd(22)} ${n}`);
  console.log(`\nAdmin login: admin@jumpstartusa.org / ${DEMO_PASSWORD}`);
  console.log('Demo users:  <role_key>@jumpstartusa.org with the same password.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
