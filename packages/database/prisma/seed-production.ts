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
 * THIS SCRIPT PRINTS NO CREDENTIAL, EVER.
 *
 * It used to generate a temporary password and log it. That output does not
 * vanish with the terminal: this runs as a container job, so it landed in
 * Azure Container Instance logs and stayed there — a live production
 * administrator password, readable by anyone with Reader on the resource
 * group, found three weeks after the fact still sitting in a completed
 * container. Same shape as the invite flow that used to email a temporary
 * password, in a place nobody thought to look.
 *
 * Two ways in, neither of which writes a secret anywhere a log can reach:
 *
 *   ADMIN_PASSWORD set — used as given. Pass it the way DATABASE_URL is
 *     passed (--secure-environment-variables), not on a command line.
 *
 *   ADMIN_PASSWORD unset — the account is created with a password nobody
 *     knows, and the operator uses "Forgot password" on the sign-in page. The
 *     reset link is hashed at rest, single-use and expires in an hour, and it
 *     goes to the admin's mailbox rather than to a log. Needs outbound email
 *     configured; GET /api/health reports whether it is.
 *
 * Env:
 *   CONFIRM_RESET     required, literal "yes"
 *   ADMIN_EMAIL       default mark@jumpstartusa.org
 *   ADMIN_FIRST_NAME  default Mark
 *   ADMIN_LAST_NAME   default Pitto
 *   ADMIN_PASSWORD    optional — see above. Never printed either way.
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
  const supplied = process.env.ADMIN_PASSWORD;
  /**
   * With no password supplied the account gets an UNUSABLE one: 32 random
   * bytes hashed and immediately discarded. Nothing — not this process a line
   * later — can produce the plaintext, so there is no credential to leak and
   * the only way in is the password-reset flow.
   */
  const password = supplied ?? randomBytes(32).toString('hex');

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
  if (supplied) {
    console.log('  Password: the ADMIN_PASSWORD you supplied. Nothing was printed or stored in clear.');
  } else {
    console.log('  Password: NONE set — the account cannot be signed into yet, by design.');
    console.log(`  Next: open the sign-in page, choose "Forgot password", and enter ${adminEmail}.`);
    console.log('        The link is emailed, single-use and expires in an hour.');
    console.log('        (No outbound email? Re-run with ADMIN_PASSWORD set as a secure variable.)');
  }
  console.log('  Then enroll a second factor at /account — admin is a TOTP-required role.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
