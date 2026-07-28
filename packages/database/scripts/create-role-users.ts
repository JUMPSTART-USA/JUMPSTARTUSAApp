// Ensure one active user account per role — the production counterpart of the
// demo seed's role users, with no demo data. Safe to re-run.
//
//   * For every role except admin: upserts `<role_key>@jumpstartusa.org`,
//     re-activates it if inactive, attaches the role, and sets the password
//     from env (existing passwords ARE overwritten — this script is the
//     rotation tool for the shared role accounts).
//   * Requires RBAC to exist (run create-admin.ts first on a fresh database).
//
// Required env: DATABASE_URL, USERS_PASSWORD
//
// Run (from packages/database): pnpm exec tsx scripts/create-role-users.ts
// In Azure: one-off ACI from the jumpstart-migrate image, same pattern as
// .github/scripts/run-migration-job.sh — pass USERS_PASSWORD as a secure env.

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { ROLE_KEYS, ROLE_NAMES } from '@jumpstart/shared';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

async function main(): Promise<void> {
  const password = requireEnv('USERS_PASSWORD');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const roles = await prisma.role.findMany();
  if (roles.length === 0) {
    throw new Error('no roles found — run create-admin.ts first to bootstrap RBAC');
  }
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));

  // Audit stamp: the first admin-role user (the real admin account).
  const adminLink = await prisma.userRole.findFirst({
    where: { roleId: roleIdByKey.get('admin') ?? '' },
    orderBy: { userId: 'asc' },
  });
  const auditId = adminLink?.userId ?? null;

  for (const key of ROLE_KEYS) {
    if (key === 'admin') continue; // the real admin is managed by create-admin.ts
    const roleId = roleIdByKey.get(key);
    if (!roleId) throw new Error(`role ${key} missing`);
    const email = `${key}@jumpstartusa.org`;

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: ROLE_NAMES[key],
          lastName: 'Account',
          status: 'active',
          createdById: auditId,
          updatedById: auditId,
        },
      });
      console.log(`created ${email}`);
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, status: 'active', updatedById: auditId },
      });
      console.log(`updated ${email} (password set, active)`);
    }

    const hasRole = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId },
    });
    if (!hasRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
      console.log(`  ${key} role attached`);
    }
  }

  console.log('done');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
