/**
 * PRODUCTION RESET: wipes ALL application data and bootstraps a clean system
 * — the RBAC scaffolding (roles/permissions from @jumpstart/shared) plus a
 * single admin account. No demo content of any kind: no participants,
 * institutions, classes, volunteers, donors, settings or audit history.
 *
 * Deliberately destructive, so it refuses to run unless CONFIRM_RESET=yes.
 * Intended to be run as a one-off container job inside the production VNet
 * (same pattern as migrations), or locally against an explicit DATABASE_URL:
 *
 *   CONFIRM_RESET=yes pnpm --filter @jumpstart/database seed:production
 *
 * Env:
 *   CONFIRM_RESET     required, literal "yes"
 *   ADMIN_EMAIL       default mark@jumpstartusa.org
 *   ADMIN_FIRST_NAME  default Mark
 *   ADMIN_LAST_NAME   default Pitto
 *   ADMIN_PASSWORD    optional — when omitted, a random temporary password is
 *                     generated and printed ONCE below. Change it after the
 *                     first sign-in either way.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  ROLE_KEYS,
  ROLE_NAMES,
  permissionsForRole,
} from '@jumpstart/shared';

const prisma = new PrismaClient();

// Same list the dev seed wipes: CASCADE truncates every table that
// references these transitively, so the whole content graph goes.
const TABLES = [
  'persons', 'users', 'roles', 'permissions', 'institutions',
  'outside_programs', 'transitional_homes', 'onboarding_checklist_templates',
  'mentor_screening_templates', 'donors', 'campaigns', 'events', 'vendors',
  'employers', 'vehicles', 'communication_templates', 'communication_batches',
  'data_sharing_agreements', 'app_settings', 'audit_logs',
  'attachments', 'volunteer_applications', 'referrals_inbox', 'session',
];

async function main() {
  if (process.env.CONFIRM_RESET !== 'yes') {
    console.error(
      'Refusing to run: this wipes EVERY row in the target database.\n' +
        'Set CONFIRM_RESET=yes to proceed.',
    );
    process.exitCode = 1;
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? 'mark@jumpstartusa.org';
  const firstName = process.env.ADMIN_FIRST_NAME ?? 'Mark';
  const lastName = process.env.ADMIN_LAST_NAME ?? 'Pitto';
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );

  // RBAC from the one source of truth shared with the API and SPA (§6.14).
  await prisma.permission.createMany({ data: ALL_PERMISSIONS.map((key) => ({ key })) });
  const permIdByKey = new Map<string, string>(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id]),
  );
  for (const key of ROLE_KEYS) {
    const role = await prisma.role.create({
      data: { key, name: ROLE_NAMES[key], isSystem: true },
    });
    await prisma.rolePermission.createMany({
      data: permissionsForRole(key).map((pk) => {
        const permissionId = permIdByKey.get(pk);
        if (!permissionId) throw new Error(`unknown permission ${pk}`);
        return { roleId: role.id, permissionId };
      }),
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'admin' } });
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      firstName,
      lastName,
      status: 'active',
    },
  });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });

  console.log('Production reset complete.');
  console.log(`  Roles: ${ROLE_KEYS.length}, permissions: ${ALL_PERMISSIONS.length}`);
  console.log(`  Admin account: ${adminEmail}`);
  if (generated) {
    console.log(`  Temporary password (shown once — change after first sign-in): ${password}`);
  } else {
    console.log('  Password: as provided via ADMIN_PASSWORD — change it if it was shared.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
