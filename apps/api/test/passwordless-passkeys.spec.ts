import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthService, hashPassword } from '../src/auth/auth.service';
import { isPasswordlessReady } from '../src/auth/passkeys.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Passwordless sign-in (§3.2 phase 2).
 *
 * The WebAuthn ceremony itself cannot be tested here — a valid assertion needs
 * a real authenticator, and no fixture can forge a signature over a challenge
 * this process just minted. What IS testable is everything the plan called the
 * high-severity risks, none of which involve a signature:
 *
 *  - an INELIGIBLE credential must never sign in this way,
 *  - the options endpoint must not name any credential (enumeration),
 *  - the account guards (lockout, status, soft-delete) must apply to this path
 *    as much as to the password path.
 *
 * Each assertion below fails if the guard it covers is removed — that is the
 * bar this repo sets for a safety test.
 */
const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

let app: NestExpressApplication;
let server: ReturnType<NestExpressApplication['getHttpServer']>;
let prisma: PrismaService;
let auth: AuthService;

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
  prisma = app.get(PrismaService);
  auth = app.get(AuthService);
});

afterAll(async () => {
  await app?.close();
});

/** A throwaway user, plus one passkey row with the given eligibility. */
async function userWithCredential(opts: {
  discoverable: boolean | null;
  userVerified: boolean | null;
  status?: 'invited' | 'active' | 'deactivated';
  lockedUntil?: Date | null;
  deletedAt?: Date | null;
}) {
  const email = `pwless-${randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(randomUUID()),
      firstName: 'Passwordless',
      lastName: 'Probe',
      status: opts.status ?? 'active',
      lockedUntil: opts.lockedUntil ?? null,
      deletedAt: opts.deletedAt ?? null,
    },
  });
  const credential = await prisma.webAuthnCredential.create({
    data: {
      userId: user.id,
      credentialId: `cred-${randomUUID()}`,
      publicKey: Buffer.from([1, 2, 3]),
      counter: BigInt(0),
      transports: [],
      deviceType: 'multiDevice',
      backedUp: true,
      discoverable: opts.discoverable,
      userVerified: opts.userVerified,
      label: 'Probe key',
    },
  });
  return { user, credential };
}

describe('passwordless eligibility is a positive fact, never an assumption', () => {
  // Mutation check: relaxing either `=== true` to a truthy test flips the null
  // rows below, which is exactly the silent downgrade this guards against.
  const cases: Array<[boolean | null, boolean | null, boolean]> = [
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
    [null, null, false],
    [true, null, false],
    [null, true, false],
  ];

  for (const [discoverable, userVerified, expected] of cases) {
    it(`discoverable=${discoverable} userVerified=${userVerified} -> ${expected}`, () => {
      expect(isPasswordlessReady({ discoverable, userVerified })).toBe(expected);
    });
  }

  it('treats a credential enrolled before the columns existed as ineligible', () => {
    // Every credential enrolled before this feature reads null/null. If this
    // ever returns true, existing second-factor-only passkeys silently become
    // single-factor logins.
    expect(isPasswordlessReady({ discoverable: null, userVerified: null })).toBe(false);
  });
});

describe('the options endpoint cannot be used to discover accounts', () => {
  it('is public, takes no identifier, and names no credential', async () => {
    const res = await request(server)
      .post('/api/auth/passkeys/discoverable-options')
      .set('Origin', ORIGIN)
      .send({})
      .expect(200);

    expect(res.body.challenge).toBeTruthy();
    // The whole enumeration argument: an allowCredentials list would be a
    // per-account answer. Absent or empty are both fine; populated is not.
    expect(res.body.allowCredentials ?? []).toHaveLength(0);
    // Without a password in front of it, the gesture IS the second factor.
    expect(res.body.userVerification).toBe('required');
  });

  it('does not vary by any submitted address', async () => {
    const withEmail = await request(server)
      .post('/api/auth/passkeys/discoverable-options')
      .set('Origin', ORIGIN)
      .send({ email: 'admin@jumpstartusa.org' })
      .expect(200);
    // A stray field must not become an input — same shape either way.
    expect(withEmail.body.allowCredentials ?? []).toHaveLength(0);
  });
});

describe('a passwordless attempt fails the same way for every reason', () => {
  it('refuses an assertion with no challenge in the session', async () => {
    const res = await request(server)
      .post('/api/auth/passkeys/passwordless-login')
      .set('Origin', ORIGIN)
      .send({ passkeyResponse: { id: 'nope' } })
      .expect(401);
    expect(res.body.message).toBe('Start the passkey sign-in again');
  });

  it('refuses an unknown credential with the generic message', async () => {
    const agent = request.agent(server);
    await agent.post('/api/auth/passkeys/discoverable-options').set('Origin', ORIGIN).send({});
    const res = await agent
      .post('/api/auth/passkeys/passwordless-login')
      .set('Origin', ORIGIN)
      .send({ passkeyResponse: { id: `unknown-${randomUUID()}` } })
      .expect(401);
    // Must not distinguish "no such credential" from "bad signature".
    expect(res.body.message).toBe('Passkey sign-in failed');
  });

  it('refuses a KNOWN but ineligible credential with the same message', async () => {
    const { credential } = await userWithCredential({ discoverable: false, userVerified: false });
    const agent = request.agent(server);
    await agent.post('/api/auth/passkeys/discoverable-options').set('Origin', ORIGIN).send({});
    const res = await agent
      .post('/api/auth/passkeys/passwordless-login')
      .set('Origin', ORIGIN)
      .send({ passkeyResponse: { id: credential.credentialId } })
      .expect(401);
    expect(res.body.message).toBe('Passkey sign-in failed');
  });
});

describe('the account guards apply to passwordless too', () => {
  /**
   * These call the service directly. The endpoint cannot reach this code
   * without a real assertion, but the guards are the point — a future
   * refactor that verifies a signature and then forgets to ask whether the
   * account is usable would pass every test above and none of these.
   */
  it('refuses a locked-out account', async () => {
    const { user } = await userWithCredential({
      discoverable: true,
      userVerified: true,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
    });
    await expect(auth.validatePasswordlessLogin(user.id)).rejects.toThrow(
      /Too many failed sign-in attempts/,
    );
  });

  it('refuses a deactivated account', async () => {
    const { user } = await userWithCredential({
      discoverable: true,
      userVerified: true,
      status: 'deactivated',
    });
    await expect(auth.validatePasswordlessLogin(user.id)).rejects.toThrow(
      /This account is not active/,
    );
  });

  it('refuses a soft-deleted account', async () => {
    const { user } = await userWithCredential({
      discoverable: true,
      userVerified: true,
      deletedAt: new Date(),
    });
    await expect(auth.validatePasswordlessLogin(user.id)).rejects.toThrow(/Passkey sign-in failed/);
  });

  it('lets an ordinary account through, and counts as the second factor', async () => {
    const { user } = await userWithCredential({ discoverable: true, userVerified: true });
    const result = await auth.validatePasswordlessLogin(user.id);
    expect(result.status).toBe('ok');
    expect(result.user?.id).toBe(user.id);
    // An eligible credential is possession + user verification, so the mandate
    // is already satisfied — never nag someone who just used a stronger factor.
    expect(result.user?.mustSetupTotp).toBe(false);
  });

  it('clears brute-force state and records how the session was obtained', async () => {
    const { user } = await userWithCredential({ discoverable: true, userVerified: true });
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 4 } });

    await auth.validatePasswordlessLogin(user.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lastLoginAt).not.toBeNull();

    const row = await prisma.auditLog.findFirst({
      where: { userId: user.id, action: 'login' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
    expect((row?.metadata as { method?: string } | null)?.method).toBe('passkey_passwordless');
  });

  it('activates an invited account on first passwordless sign-in', async () => {
    const { user } = await userWithCredential({
      discoverable: true,
      userVerified: true,
      status: 'invited',
    });
    await auth.validatePasswordlessLogin(user.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.status).toBe('active');
  });
});
