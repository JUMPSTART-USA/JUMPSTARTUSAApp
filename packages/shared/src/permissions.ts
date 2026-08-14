// Central RBAC definitions (§4.1.4, §6.14 of the architecture plan).
// This file is the ONE place permissions are defined:
//   * The API seeds roles/permissions from it and enforces it in guards.
//   * The SPA reads the same definitions to hide navigation and controls.
//
// Permission key format: "<module>.<action>" plus dotted special permissions.

export const MODULES = [
  'participants',
  'institutions',
  'inside_classes',
  'outside_programs',
  'housing',
  'case_management', // checklists, notes, services, plans, goals, tasks, referrals
  'volunteers', // profiles, assignments, trainings, clearances, background checks
  'mentoring', // screenings, assignments, session logs (Phase 3 workflows)
  'alumni', // engagements, outcome check-ins
  'donors', // donors, donations, pledges, recurring gifts, interactions, tasks, funds, households
  'campaigns',
  'events',
  'vendors',
  'employers',
  'employment',
  'vehicles',
  'communications',
  'intake_queues', // volunteer applications, referral inbox, alumni updates
  'reports',
  'dashboard',
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ['create', 'read', 'update', 'delete', 'export'] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Special permissions beyond module × action:
 *  - case_notes.confidential.read: read OTHER staff's confidential notes.
 *    (A note's author and the participant's assigned case manager always read
 *    their own — enforced in the service layer, not by this permission.)
 *  - fields.justice.read: DOC numbers, offense-related and justice-history fields
 *  - fields.pay.read: pay rate / hours on employment records
 *  - fields.background_checks.read: background-check adjudication results
 *    (clear/review/not-cleared) — the fourth §7.2 field class; module-level
 *    volunteers.read alone must never expose adjudications
 *  - person.merge: run the duplicate-merge tool (Phase 2)
 *  - admin.users / admin.roles / admin.settings / admin.templates: administration
 *  - audit.read: audit-log viewer
 *  - referral_inbox.read: the get-help queue holds third-party PII about
 *    justice-involved people — tighter than other intake queues (§6.11)
 *  - support.access: file support tickets and read your own — held by every
 *    role; administrators additionally work the whole queue (admin role)
 */
export const SPECIAL_PERMISSIONS = [
  'case_notes.confidential.read',
  'fields.justice.read',
  'fields.pay.read',
  'fields.background_checks.read',
  'person.merge',
  'admin.users',
  'admin.roles',
  'admin.settings',
  'admin.templates',
  'audit.read',
  'referral_inbox.read',
  'support.access',
] as const;
export type SpecialPermission = (typeof SPECIAL_PERMISSIONS)[number];

export type ModulePermission = `${Module}.${Action}`;
export type PermissionKey = ModulePermission | SpecialPermission;

export const ALL_PERMISSIONS: PermissionKey[] = [
  ...MODULES.flatMap((m) => ACTIONS.map((a) => `${m}.${a}` as ModulePermission)),
  ...SPECIAL_PERMISSIONS,
];

// ── Role definitions ────────────────────────────────────────────────────────

export const ROLE_KEYS = [
  'admin',
  'executive',
  'inside_program_staff',
  'outside_program_staff',
  'case_manager',
  'housing_staff',
  'volunteer_coordinator',
  'development_staff',
  'employment_coordinator',
  'fleet_manager',
  'read_only',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * Roles whose accounts must carry a second factor (§3.2). Consumed at login
 * (mustSetupTotp), by /auth/me, and by the SPA's enrollment nudge banner —
 * soft enforcement: the account still works, but the ask is always visible.
 */
export const TOTP_REQUIRED_ROLES: readonly RoleKey[] = ['admin', 'executive'];

export const ROLE_NAMES: Record<RoleKey, string> = {
  admin: 'Administrator',
  executive: 'Executive Leadership',
  inside_program_staff: 'Inside Program Staff',
  outside_program_staff: 'Outside Program Staff',
  case_manager: 'Case Manager',
  housing_staff: 'Housing Staff',
  volunteer_coordinator: 'Volunteer Coordinator',
  development_staff: 'Development Staff',
  employment_coordinator: 'Employment Coordinator',
  fleet_manager: 'Fleet Manager',
  read_only: 'Read Only',
};

const crud = (m: Module): ModulePermission[] => [
  `${m}.create`,
  `${m}.read`,
  `${m}.update`,
  `${m}.delete`,
];
const crue = (m: Module): ModulePermission[] => [
  `${m}.create`,
  `${m}.read`,
  `${m}.update`,
  `${m}.export`,
];
const readExport = (m: Module): ModulePermission[] => [`${m}.read`, `${m}.export`];
const read = (m: Module): ModulePermission[] => [`${m}.read`];

/**
 * The seeded permission set per role. Roles are ADDITIVE — a user holding
 * several roles gets the union. Deletes are deliberately rare: most roles
 * close/exit records rather than delete them; admin holds delete everywhere.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  admin: ALL_PERMISSIONS,

  executive: [
    ...readExport('dashboard'),
    ...readExport('reports'),
    ...read('participants'),
    ...read('institutions'),
    ...read('inside_classes'),
    ...read('outside_programs'),
    ...read('housing'),
    ...read('case_management'), // counts and non-confidential activity only (§7.3)
    ...read('volunteers'),
    ...read('mentoring'),
    ...read('alumni'),
    ...readExport('donors'),
    ...readExport('campaigns'),
    ...readExport('events'),
    ...read('vendors'),
    ...read('employers'),
    ...read('employment'),
    ...read('vehicles'),
    'support.access',
  ],

  inside_program_staff: [
    ...read('dashboard'),
    ...crue('participants'),
    ...crud('institutions'),
    ...crue('inside_classes'),
    ...read('volunteers'),
    ...readExport('reports'),
    'fields.justice.read', // works with DOC ids and facilities daily
    'support.access',
  ],

  outside_program_staff: [
    ...read('dashboard'),
    ...crue('participants'),
    ...crue('outside_programs'),
    ...read('housing'),
    ...read('case_management'),
    ...read('volunteers'),
    ...readExport('reports'),
    'support.access',
  ],

  case_manager: [
    ...read('dashboard'),
    ...crue('participants'),
    ...crue('case_management'),
    ...read('inside_classes'),
    ...crue('outside_programs'),
    ...read('housing'),
    ...crue('alumni'),
    ...read('mentoring'),
    ...read('employers'),
    ...read('employment'),
    ...crue('communications'),
    ...['intake_queues.read', 'intake_queues.update'] as ModulePermission[],
    ...readExport('reports'),
    'fields.justice.read',
    'referral_inbox.read',
    'support.access',
  ],

  housing_staff: [
    ...read('dashboard'),
    ...crue('housing'),
    ...read('participants'),
    ...read('case_management'),
    ...readExport('reports'),
    'support.access',
  ],

  volunteer_coordinator: [
    ...read('dashboard'),
    ...crue('volunteers'),
    'fields.background_checks.read', // operates the screening pipeline (§6.6)
    ...crue('mentoring'),
    ...read('participants'), // mentor matching needs mentee basics, not case files
    ...read('institutions'),
    ...read('inside_classes'),
    ...read('outside_programs'),
    ...read('events'),
    ...crue('communications'),
    ...['intake_queues.read', 'intake_queues.update'] as ModulePermission[],
    ...readExport('reports'),
    'support.access',
  ],

  development_staff: [
    ...read('dashboard'),
    ...crue('donors'), // full native donor management (§6.8)
    ...crue('campaigns'),
    ...crue('events'),
    ...crue('vendors'),
    ...crue('communications'),
    ...readExport('reports'),
    'support.access',
  ],

  employment_coordinator: [
    ...read('dashboard'),
    ...crue('employers'),
    ...crue('employment'),
    ...read('participants'),
    ...readExport('reports'),
    'fields.pay.read',
    'support.access',
  ],

  fleet_manager: [
    ...read('dashboard'),
    ...crue('vehicles'),
    ...read('vendors'),
    ...['vendors.create'] as ModulePermission[],
    ...readExport('reports'),
    'support.access',
  ],

  read_only: [
    ...read('dashboard'),
    ...read('participants'),
    ...read('institutions'),
    ...read('inside_classes'),
    ...read('outside_programs'),
    ...read('housing'),
    ...read('volunteers'),
    ...read('campaigns'),
    ...read('events'),
    ...read('employers'),
    ...read('vehicles'),
    ...read('reports'),
    'support.access',
  ],
};

/** Dedupe helper — role definitions above may repeat keys via helpers. */
export function permissionsForRole(role: RoleKey): PermissionKey[] {
  return [...new Set(ROLE_PERMISSIONS[role])];
}

export function permissionsForRoles(roles: RoleKey[]): Set<PermissionKey> {
  return new Set(roles.flatMap((r) => permissionsForRole(r)));
}

export function hasPermission(
  granted: ReadonlySet<string> | readonly string[],
  needed: PermissionKey,
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(needed);
}
