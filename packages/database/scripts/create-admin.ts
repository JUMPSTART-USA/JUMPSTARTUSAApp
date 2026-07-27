// Bootstrap (or repair) the real admin account — the production counterpart of
// the demo seed's user setup, with no demo data. Safe to re-run.
//
//   * If no roles exist yet (fresh database), creates the full RBAC layer
//     (permissions, roles, role-permission links) from @jumpstart/shared.
//   * Upserts the admin user from env and attaches the `admin` role.
//   * Never overwrites an existing password unless RESET_PASSWORD=1.
//
// Required env: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
// Optional env: ADMIN_FIRST_NAME, ADMIN_LAST_NAME, RESET_PASSWORD=1
//
// Run (from packages/database): pnpm exec tsx scripts/create-admin.ts
// In Azure: one-off ACI from the jumpstart-migrate image, same pattern as
// .github/scripts/run-migration-job.sh — pass ADMIN_* as secure env vars.

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  ROLE_KEYS,
  ROLE_NAMES,
  permissionsForRole,
  type RoleKey,
} from '@jumpstart/shared';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

async function ensureRbac(): Promise<Map<RoleKey, string>> {
  const roleIdByKey = new Map<RoleKey, string>();
  const existing = await prisma.role.findMany();
  if (existing.length > 0) {
    for (const r of existing) roleIdByKey.set(r.key as RoleKey, r.id);
    console.log(`RBAC already present (${existing.length} roles) — leaving as is`);
    return roleIdByKey;
  }

  console.log('empty database — creating permissions and roles');
  await prisma.permission.createMany({ data: ALL_PERMISSIONS.map((key) => ({ key })) });
  const permIdByKey = new Map<string, string>(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id]),
  );
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

async function main(): Promise<void> {
  const email = requireEnv('ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('ADMIN_PASSWORD');
  const firstName = process.env.ADMIN_FIRST_NAME ?? 'Admin';
  const lastName = process.env.ADMIN_LAST_NAME ?? 'User';

  const roleIdByKey = await ensureRbac();
  const adminRoleId = roleIdByKey.get('admin');
  if (!adminRoleId) throw new Error('admin role missing');

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName, status: 'active' },
    });
    console.log(`created user ${email}`);
  } else {
    console.log(`user ${email} already exists`);
    if (process.env.RESET_PASSWORD === '1') {
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      user = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, status: 'active' },
      });
      console.log('password reset and account re-activated');
    }
  }

  const hasRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: adminRoleId },
  });
  if (!hasRole) {
    await prisma.userRole.create({ data: { userId: user.id, roleId: adminRoleId } });
    console.log('admin role attached');
  } else {
    console.log('admin role already attached');
  }

  // Backfill audit columns on rows this bootstrap created without an author.
  await prisma.user.updateMany({
    where: { createdById: null },
    data: { createdById: user.id, updatedById: user.id },
  });
  await prisma.role.updateMany({
    where: { createdById: null },
    data: { createdById: user.id, updatedById: user.id },
  });
  await prisma.permission.updateMany({
    where: { createdById: null },
    data: { createdById: user.id, updatedById: user.id },
  });

  console.log('done');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
