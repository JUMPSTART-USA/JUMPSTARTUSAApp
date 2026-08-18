import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The eligibility gate, pinned properly.
 *
 * A first attempt tested this through the HTTP endpoint with a made-up
 * assertion and looked fine — but it passed just as happily with the gate
 * DELETED, because an invalid signature is refused anyway and both refusals
 * produce the same 401. It measured the signature check, not the gate.
 *
 * So the signature check is mocked to always succeed. With that out of the
 * way the eligibility gate is the only thing left that can refuse, and these
 * tests fail the moment it is removed or weakened — which is the property a
 * safety test has to have.
 */
vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/server')>();
  return {
    ...actual,
    verifyAuthenticationResponse: vi.fn(async () => ({
      verified: true,
      authenticationInfo: { newCounter: 1, credentialID: 'stub', userVerified: true },
    })),
  };
});

// Static imports: vitest hoists the vi.mock above them, so the service still
// picks up the stubbed verifier. (Top-level await is not available here — this
// package typechecks as CommonJS.)
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/auth.service';
import { PasskeysService } from '../src/auth/passkeys.service';
import { PrismaService } from '../src/prisma/prisma.service';

let app: NestExpressApplication;
let prisma: PrismaService;
let passkeys: PasskeysService;

beforeAll(async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
  passkeys = app.get(PasskeysService);
});

afterAll(async () => {
  await app?.close();
});

async function seedCredential(discoverable: boolean | null, userVerified: boolean | null) {
  const user = await prisma.user.create({
    data: {
      email: `gate-${randomUUID()}@example.test`,
      passwordHash: await hashPassword(randomUUID()),
      firstName: 'Gate',
      lastName: 'Probe',
      status: 'active',
    },
  });
  const credential = await prisma.webAuthnCredential.create({
    data: {
      userId: user.id,
      credentialId: `gate-cred-${randomUUID()}`,
      publicKey: Buffer.from([1, 2, 3]),
      counter: BigInt(0),
      transports: [],
      deviceType: 'multiDevice',
      backedUp: true,
      discoverable,
      userVerified,
      label: 'Gate probe',
    },
  });
  return { user, credential };
}

/**
 * An assertion with NO user handle. Kept because some authenticators omit it,
 * but note what it does NOT exercise — see `assertionFor` below.
 */
const assertion = (id: string) =>
  ({ id, response: {} }) as unknown as AuthenticationResponseJSON;

/**
 * A REALISTIC assertion: carries the user handle, base64url-encoded, exactly as
 * @simplewebauthn/browser returns it (`userHandle?: Base64URLString`).
 *
 * The fixture above hid a deny-all bug for a whole release. registrationOptions
 * passes the raw UTF-8 user id as userID, the browser hands it back encoded, and
 * the service compared the two directly — never equal, so every passwordless
 * sign-in was refused. With `response: {}` the check short-circuited on
 * `if (handle)` and never ran, so the gate tests passed while the feature was
 * unusable. Found by a human trying it on staging, which is the wrong way to
 * find it.
 */
const assertionFor = (id: string, userId: string) =>
  ({
    id,
    response: { userHandle: Buffer.from(userId, 'utf8').toString('base64url') },
  }) as unknown as AuthenticationResponseJSON;

describe('only an eligible credential can sign in passwordless', () => {
  it('accepts one that is discoverable AND user-verified', async () => {
    const { user, credential } = await seedCredential(true, true);
    const result = await passkeys.verifyDiscoverableAuthentication(
      assertion(credential.credentialId),
      'challenge',
    );
    // The control: with the signature stubbed valid, an eligible credential
    // resolves its owner. If this ever returns null the gate is over-tight.
    expect(result).toBe(user.id);
  });

  it('refuses a non-discoverable credential even with a valid signature', async () => {
    const { credential } = await seedCredential(false, true);
    expect(
      await passkeys.verifyDiscoverableAuthentication(
        assertion(credential.credentialId),
        'challenge',
      ),
    ).toBeNull();
  });

  it('refuses a credential without user verification even with a valid signature', async () => {
    const { credential } = await seedCredential(true, false);
    expect(
      await passkeys.verifyDiscoverableAuthentication(
        assertion(credential.credentialId),
        'challenge',
      ),
    ).toBeNull();
  });

  it('refuses a credential enrolled before eligibility was recorded', async () => {
    // The real-world case: every passkey enrolled before this feature, including
    // the one on the production admin account.
    const { credential } = await seedCredential(null, null);
    expect(
      await passkeys.verifyDiscoverableAuthentication(
        assertion(credential.credentialId),
        'challenge',
      ),
    ).toBeNull();
  });

  it('accepts a realistic assertion carrying the base64url user handle', async () => {
    // The regression test for the deny-all: this is the shape a real browser
    // sends, and it must resolve to the owner rather than being refused.
    const { user, credential } = await seedCredential(true, true);
    const result = await passkeys.verifyDiscoverableAuthentication(
      assertionFor(credential.credentialId, user.id),
      'challenge',
    );
    expect(result).toBe(user.id);
  });

  it('still refuses a handle belonging to someone else', async () => {
    // The check the decode exists to preserve — decoding must not weaken it.
    const { credential } = await seedCredential(true, true);
    const other = await seedCredential(true, true);
    expect(
      await passkeys.verifyDiscoverableAuthentication(
        assertionFor(credential.credentialId, other.user.id),
        'challenge',
      ),
    ).toBeNull();
  });

  it('refuses an unreadable handle rather than guessing', async () => {
    const { credential } = await seedCredential(true, true);
    const bad = {
      id: credential.credentialId,
      response: { userHandle: '!!!not-base64url!!!' },
    } as unknown as AuthenticationResponseJSON;
    expect(await passkeys.verifyDiscoverableAuthentication(bad, 'challenge')).toBeNull();
  });

  it('does not touch the signature counter when it refuses', async () => {
    const { credential } = await seedCredential(null, null);
    await passkeys.verifyDiscoverableAuthentication(
      assertion(credential.credentialId),
      'challenge',
    );
    const after = await prisma.webAuthnCredential.findUniqueOrThrow({
      where: { id: credential.id },
    });
    // Refusing before any state change also means an ineligible credential
    // cannot be nudged toward a clone-detection false positive by an attacker
    // replaying assertions at it.
    expect(Number(after.counter)).toBe(0);
    expect(after.lastUsedAt).toBeNull();
  });
});
