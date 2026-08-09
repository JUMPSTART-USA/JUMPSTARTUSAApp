// Ensure one active user account per role — the production counterpart of the
// demo seed's role users, with no demo data. Safe to re-run.
//
//   * For every role except admin: upserts `<role_key>@jumpstartusa.org`,
//     re-activates it if inactive, attaches the role, and sets the password
//     from env (existing passwords ARE overwritten — this script is the
//     rotation tool for the shared role accounts).
//   * Requires RBAC to exist (run create-admin.ts first on a fresh database).
//   * Optional chapter scoping (§7.2 — docs/chapter-scoping.md): USER_CHAPTERS
//     scopes role accounts to one chapter each, e.g.
//     USER_CHAPTERS="case_manager=SC,volunteer_coordinator=GA" (the demo seed's
//     defaults). A listed account ends up scoped to exactly that chapter — any
//     other scope row it had is removed; roles left out get no scope row and
//     therefore see all chapters. `admin` is rejected: admins are always
//     all-chapters.
//
// Required env: DATABASE_URL, USERS_PASSWORD
// Optional env: USER_CHAPTERS
//
// Run (from packages/database): pnpm exec tsx scripts/create-role-users.ts
// In Azure: one-off ACI from the jumpstart-migrate image, same pattern as
// .github/scripts/run-migration-job.sh — pass USERS_PASSWORD as a secure env.

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { CHAPTER_STATES, ROLE_KEYS, ROLE_NAMES, isChapterState } from '@jumpstart/shared';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

/** Parse USER_CHAPTERS ("role_key=STATE,role_key=STATE") into role → chapter. */
function parseUserChapters(): Map<string, string> {
  const out = new Map<string, string>();
  const raw = process.env.USER_CHAPTERS;
  if (!raw) return out;
  for (const entry of raw.split(',')) {
    const part = entry.trim();
    if (!part) continue;
    const [role, state] = part.split('=').map((s) => s.trim());
    if (!role || !state) {
      throw new Error(`USER_CHAPTERS entry "${part}" must look like role_key=STATE`);
    }
    if (role === 'admin') {
      throw new Error('admins are always all-chapters — remove admin from USER_CHAPTERS');
    }
    if (!(ROLE_KEYS as readonly string[]).includes(role)) {
      throw new Error(`USER_CHAPTERS references unknown role ${role}`);
    }
    if (!isChapterState(state)) {
      throw new Error(`USER_CHAPTERS: ${state} is not a chapter (${CHAPTER_STATES.join(', ')})`);
    }
    out.set(role, state);
  }
  return out;
}

async function main(): Promise<void> {
  const password = requireEnv('USERS_PASSWORD');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const chapterByRole = parseUserChapters();

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

    // Chapter scoping (§7.2): exactly the requested chapter, or nothing when
    // the role is not listed in USER_CHAPTERS (= all chapters).
    const chapter = chapterByRole.get(key);
    if (chapter) {
      await prisma.userRegionScope.deleteMany({
        where: { userId: user.id, state: { not: chapter } },
      });
      const scoped = await prisma.userRegionScope.findFirst({
        where: { userId: user.id, state: chapter },
      });
      if (!scoped) {
        await prisma.userRegionScope.create({ data: { userId: user.id, state: chapter } });
      }
      console.log(`  scoped to the ${chapter} chapter`);
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
