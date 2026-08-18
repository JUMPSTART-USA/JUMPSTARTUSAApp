import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthService, hashPassword } from '../src/auth/auth.service';
import { AdminUsersService } from '../src/modules/admin/users.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Admin account controls (§3.1/§3.2): issue a password reset, remove passkeys
 * without touching TOTP, and suspend/restore sign-in.
 *
 * The suspension tests are the ones that matter most. Suspension is enforced in
 * `assertAccountUsable`, which BOTH sign-in paths call — so the test that would
 * catch a regression is the one proving a suspended account cannot get in with
 * a passkey either. A suspension that only stopped passwords would be no
 * suspension at all now that a passkey alone opens a session.
 */
const PASSWORD = 'AdminControlsProbe2026!';

let app: NestExpressApplication;
let prisma: PrismaService;
let users: AdminUsersService;
let auth: AuthService;

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
  users = app.get(AdminUsersService);
  auth = app.get(AuthService);
});

afterAll(async () => {
  await app?.close();
});

async function makeUser(opts: { withPasskey?: boolean; withTotp?: boolean } = {}) {
  const email = `controls-${randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      firstName: 'Controls',
      lastName: 'Probe',
      status: 'active',
      ...(opts.withTotp ? { totpEnabled: true, totpSecret: 'stub-secret' } : {}),
    },
  });
  if (opts.withPasskey) {
    await prisma.webAuthnCredential.create({
      data: {
        userId: user.id,
        credentialId: `controls-cred-${randomUUID()}`,
        publicKey: Buffer.from([1, 2, 3]),
        counter: BigInt(0),
        transports: [],
        deviceType: 'multiDevice',
        backedUp: true,
        discoverable: true,
        userVerified: true,
        label: 'Probe key',
      },
    });
  }
  return { user, email };
}

/** An admin with no second factor, so requireStepUp has nothing to demand. */
async function makeActingAdmin() {
  const { user } = await makeUser();
  return user;
}

describe('suspending sign-in closes every door, not just the password one', () => {
  it('blocks password sign-in', async () => {
    const { user, email } = await makeUser();
    const admin = await makeActingAdmin();
    await users.suspendSignIn(user.id, admin.id);

    await expect(auth.validateLogin(email, PASSWORD)).rejects.toThrow(
      /Sign-in for this account is suspended/,
    );
  });

  it('blocks PASSWORDLESS sign-in too', async () => {
    // The regression that matters: suspension lives in the shared guard, and a
    // future refactor that gives passwordless its own account checks would let
    // a suspended user straight back in with a passkey.
    const { user } = await makeUser({ withPasskey: true });
    const admin = await makeActingAdmin();
    await users.suspendSignIn(user.id, admin.id);

    await expect(auth.validatePasswordlessLogin(user.id)).rejects.toThrow(
      /Sign-in for this account is suspended/,
    );
  });

  it('says suspended, not "not active" — they are different asks of an admin', async () => {
    const { user, email } = await makeUser();
    const admin = await makeActingAdmin();
    await users.suspendSignIn(user.id, admin.id);
    await expect(auth.validateLogin(email, PASSWORD)).rejects.toThrow(/suspended/);
    await expect(auth.validateLogin(email, PASSWORD)).rejects.not.toThrow(/not active/);
  });

  it('leaves status, roles and assignments untouched — this is not deactivation', async () => {
    const { user } = await makeUser();
    const admin = await makeActingAdmin();
    await users.suspendSignIn(user.id, admin.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.status).toBe('active');
    expect(after.signInSuspendedAt).not.toBeNull();
    expect(after.signInSuspendedById).toBe(admin.id);
  });

  it('restores sign-in and clears the marker', async () => {
    const { user, email } = await makeUser();
    const admin = await makeActingAdmin();
    await users.suspendSignIn(user.id, admin.id);
    await users.restoreSignIn(user.id, admin.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.signInSuspendedAt).toBeNull();
    expect(after.signInSuspendedById).toBeNull();
    // The inverse really is the inverse: signing in works again.
    const result = await auth.validateLogin(email, PASSWORD);
    expect(result.status).toBe('ok');
  });

  it('refuses to suspend twice, or restore what is not suspended', async () => {
    const { user } = await makeUser();
    const admin = await makeActingAdmin();
    await users.suspendSignIn(user.id, admin.id);
    await expect(users.suspendSignIn(user.id, admin.id)).rejects.toThrow(/already suspended/);
    await users.restoreSignIn(user.id, admin.id);
    await expect(users.restoreSignIn(user.id, admin.id)).rejects.toThrow(/not suspended/);
  });

  it('refuses to let an admin suspend themselves', async () => {
    const admin = await makeActingAdmin();
    await expect(users.suspendSignIn(admin.id, admin.id)).rejects.toThrow(
      /cannot suspend your own/,
    );
  });
});

describe('removing passkeys leaves the authenticator app alone', () => {
  it('deletes passkeys but keeps TOTP and its secret', async () => {
    const { user } = await makeUser({ withPasskey: true, withTotp: true });
    const admin = await makeActingAdmin();

    const result = await users.removePasskeys(user.id, admin.id, {});
    expect(result.removed).toBe(1);
    expect(result.user.passkeyCount).toBe(0);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    // The whole reason this is separate from resetTotp.
    expect(after.totpEnabled).toBe(true);
    expect(after.totpSecret).not.toBeNull();
    expect(await prisma.webAuthnCredential.count({ where: { userId: user.id } })).toBe(0);
  });

  it('refuses when there is nothing to remove', async () => {
    const { user } = await makeUser();
    const admin = await makeActingAdmin();
    await expect(users.removePasskeys(user.id, admin.id, {})).rejects.toThrow(/no passkeys/);
  });
});

describe('an admin password reset issues a link, never a password', () => {
  it('mints a single-use reset token and does not change the password', async () => {
    const { user, email } = await makeUser();
    const admin = await makeActingAdmin();

    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const result = await users.resetPassword(user.id, admin.id, {});

    expect(result.resetUrl).toContain('/reset-password/');
    const token = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
    });
    expect(token).toBeTruthy();
    // Never store the raw token; the URL carries it once and the row holds a hash.
    expect(result.resetUrl).not.toContain(token!.tokenHash);

    // The existing password still works until the user actually uses the link —
    // an admin reset must not lock someone out on its own.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    const login = await auth.validateLogin(email, PASSWORD);
    expect(login.status).toBe('ok');
  });

  it('supersedes an outstanding reset link', async () => {
    const { user } = await makeUser();
    const admin = await makeActingAdmin();
    await users.resetPassword(user.id, admin.id, {});
    await users.resetPassword(user.id, admin.id, {});
    // Issuing a new one kills the old, so a lost link is revoked by reissuing.
    const live = await prisma.passwordResetToken.count({
      where: { userId: user.id, usedAt: null },
    });
    expect(live).toBe(1);
  });

  it('refuses on a deactivated account, which needs reactivating first', async () => {
    const { user } = await makeUser();
    const admin = await makeActingAdmin();
    await prisma.user.update({ where: { id: user.id }, data: { status: 'deactivated' } });
    await expect(users.resetPassword(user.id, admin.id, {})).rejects.toThrow(/Reactivate/);
  });
});
