import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { AuditService } from '../audit/audit.service';
import { verifyTotpCode } from '../common/totp.util';
import { loadEnv, rpId } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const RP_NAME = 'JUMPSTART USA Platform';

/**
 * Can this credential stand alone as a sign-in?
 *
 * Both properties must be POSITIVELY known. A credential enrolled before these
 * columns existed reads null on both and is not eligible — the properties are
 * not recoverable after the ceremony, and guessing would quietly turn a
 * two-factor login into a one-factor one. The owner re-enrolls instead.
 */
export function isPasswordlessReady(c: {
  discoverable: boolean | null;
  userVerified: boolean | null;
}): boolean {
  return c.discoverable === true && c.userVerified === true;
}

/** What the login flow hands over: the browser assertion + session challenge. */
export interface PasskeyAssertion {
  response: AuthenticationResponseJSON;
  challenge: string | undefined;
}

/**
 * Passkeys as a SECOND factor (§3.2): a WebAuthn assertion stands in for the
 * 6-digit TOTP code after the password. Registration and assertion challenges
 * ride the express session (present before sign-in — the login flow stores
 * the challenge on the pre-auth session and the successful login regenerates
 * the session id as always). rpID comes from env — passkeys BIND to it, which
 * is why this feature waited for the custom-domain cutover.
 */
@Injectable()
export class PasskeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async registrationOptions(userId: string) {
    const env = loadEnv();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { webauthnCredentials: true },
    });
    return generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpId(env),
      // Stable handle: omitting it mints a fresh random user id per ceremony,
      // so a synced passkey manager would file each enrollment as a separate
      // account for the same person.
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`,
      attestationType: 'none',
      // The same authenticator must not enroll twice — re-registering would
      // just churn counters and confuse the credential list.
      excludeCredentials: user.webauthnCredentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransport[],
      })),
      /**
       * REQUIRED, not preferred — and that switch is what makes eligibility
       * knowable at all. The 'preferred' + record-what-credProps-says design
       * foundered on WebKit: Safari creates discoverable, user-verified
       * credentials in iCloud Keychain and then does not report credProps, so
       * every Mac enrollment recorded "unknown" and was refused passwordless
       * (measured on staging, 2026-08-18 — discoverable:null,
       * userVerified:true). Recording only what is reported was right;
       * expecting WebKit to report was not.
       *
       * With residentKey REQUIRED the spec does the reporting for us: a
       * conformant client either creates a discoverable credential or fails
       * the ceremony, so success itself proves discoverability. Same for
       * userVerification. The cost is that authenticators which cannot do
       * resident keys or UV (old U2F-era security keys) can no longer enroll —
       * accepted deliberately: every credential in both environments is a
       * platform authenticator, and TOTP remains for anything exotic.
       */
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      // Still requested: a client that DOES report gets its answer recorded
      // verbatim, including a non-conformant rk:false (see verifyRegistration).
      extensions: { credProps: true },
    });
  }

  /**
   * Adding a factor is as sensitive as removing one — an unattended screen
   * must not be able to mint a persistent credential. Callers pass the
   * step-up proof; accounts with no factor yet (first enrollment) need none.
   */
  async verifyRegistration(
    userId: string,
    label: string,
    response: RegistrationResponseJSON,
    expectedChallenge: string,
    stepUp: { code?: string; passkeyResponse?: AuthenticationResponseJSON; challenge?: string } = {},
  ) {
    await this.requireStepUp(userId, stepUp);
    const env = loadEnv();
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      // Canonical origin only: an assertion from an alias host could never
      // carry a matching rpID anyway (see rpId()), so accepting alias origins
      // here would only mask a misconfiguration.
      expectedOrigin: env.WEB_ORIGIN,
      expectedRPID: rpId(env),
      // The options demand UV, so verification demands it too — a passkey
      // enrolled here must be able to stand alone at sign-in (§3.2
      // passwordless), and possession-only enrollment would quietly produce
      // second-factor-grade credentials that LOOK passwordless-ready.
      requireUserVerification: true,
    }).catch((err: Error) => {
      throw new BadRequestException(`Passkey registration failed: ${err.message}`);
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration could not be verified');
    }

    const { credential, credentialDeviceType, credentialBackedUp, userVerified } =
      verification.registrationInfo;
    /**
     * Discoverability, by report or by construction. A client that implements
     * credProps gets believed verbatim — including a non-conformant rk:false,
     * which stays false. A client that stays silent (WebKit) falls back to the
     * spec's guarantee: residentKey was REQUIRED in the options, so a ceremony
     * that verified is a discoverable credential. The old `?? null` fallback
     * predates that requirement, when silence genuinely meant unknown.
     */
    const rk = response.clientExtensionResults?.credProps?.rk ?? true;
    const row = await this.prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: new Uint8Array(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        discoverable: rk,
        userVerified,
        label,
      },
    });
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: userId,
      metadata: {
        event: 'passkey_registered',
        credentialId: row.credentialId,
        label,
        deviceType: row.deviceType,
      },
    });
    return this.toView(row);
  }

  /** Options for the login second-factor step — allowlisted to the user's passkeys. */
  async authenticationOptions(userId: string) {
    const env = loadEnv();
    const credentials = await this.prisma.webAuthnCredential.findMany({ where: { userId } });
    if (credentials.length === 0) return null;
    return generateAuthenticationOptions({
      rpID: rpId(env),
      userVerification: 'preferred',
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransport[],
      })),
    });
  }

  /** Login-retry helper: options by email, or null when there is nothing to offer. */
  async authenticationOptionsForEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return null;
    return this.authenticationOptions(user.id);
  }

  /** Verify a login assertion; bumps the clone-detection counter + lastUsedAt. */
  async verifyAuthentication(
    userId: string,
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
  ): Promise<boolean> {
    const env = loadEnv();
    const credential = await this.prisma.webAuthnCredential.findFirst({
      where: { credentialId: response.id, userId },
    });
    if (!credential) return false;

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: env.WEB_ORIGIN, // canonical only — see verifyRegistration
      expectedRPID: rpId(env),
      requireUserVerification: false, // matches the 'preferred' in the options
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransport[],
      },
    }).catch(() => null);
    if (!verification?.verified) return false;

    await this.prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    return true;
  }

  /**
   * Options for a PASSWORDLESS sign-in. Takes no identifier and returns no
   * allowCredentials, so the authenticator offers whatever it holds for this
   * RP and the browser never tells us who is trying.
   *
   * That is the whole enumeration argument: the second-factor flow can safely
   * allowlist a user's credentials because a correct password already proved
   * who they are, but doing the same here would need an email up front and
   * would answer "is this an account?" to anyone who asked. There is no such
   * question to answer if we never take the address.
   *
   * userVerification is REQUIRED, unlike the second-factor options: with no
   * password in front of it, the gesture has to be the second factor itself.
   */
  async discoverableAuthenticationOptions() {
    const env = loadEnv();
    return generateAuthenticationOptions({
      rpID: rpId(env),
      userVerification: 'required',
    });
  }

  /**
   * Verify a passwordless assertion and say WHOSE it was.
   *
   * The sibling of verifyAuthentication, which takes a userId because the
   * password already established one. Here the credential id is the only
   * identifier available, so it is looked up across all users — then the
   * eligibility gate runs before any signature work, because an ineligible
   * credential must not be able to sign in this way no matter how valid its
   * signature is.
   *
   * Returns the owning userId, or null. Callers get one undifferentiated null
   * for "no such credential", "not eligible" and "bad signature": each of the
   * three is an oracle if reported separately.
   */
  async verifyDiscoverableAuthentication(
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
  ): Promise<string | null> {
    const env = loadEnv();
    const credential = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!credential || !isPasswordlessReady(credential)) return null;

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: env.WEB_ORIGIN, // canonical only — see verifyRegistration
      expectedRPID: rpId(env),
      // Not negotiable here: this assertion IS the authentication.
      requireUserVerification: true,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransport[],
      },
    }).catch(() => null);
    if (!verification?.verified) return null;

    /**
     * The assertion carries the user handle the credential was created with —
     * this service encodes the user id there (see registrationOptions). If it
     * disagrees with the credential row's owner, something is wrong enough that
     * the right answer is no answer.
     *
     * DECODE FIRST. registrationOptions passes the raw UTF-8 bytes of the user
     * id as userID, but the browser hands the handle back BASE64URL-encoded
     * (`userHandle?: Base64URLString`). Comparing the two directly is never
     * equal, so this rejected every passwordless sign-in that carried a
     * handle — which is all of them, since a discoverable credential always
     * returns one. The check was silently inverted into a deny-all.
     */
    const handle = response.response?.userHandle;
    if (handle) {
      let decoded: string;
      try {
        decoded = Buffer.from(handle, 'base64url').toString('utf8');
      } catch {
        return null; // Unreadable handle: refuse rather than guess.
      }
      if (decoded !== credential.userId) return null;
    }

    await this.prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    return credential.userId;
  }

  /**
   * Options for a step-up ceremony (proving possession while already signed
   * in) — same shape as the login one, different purpose.
   */
  async stepUpOptions(userId: string) {
    return this.authenticationOptions(userId);
  }

  /**
   * Step-up proof (§3.2) for any action that ADDS or REMOVES a second factor:
   * a current TOTP code, or a fresh passkey assertion. An unattended
   * signed-in screen must not be enough to change how an account is secured.
   *
   * Accounts with no second factor at all have nothing to prove with — their
   * password already ran the session, and the admin reset is the backstop.
   * Throws when proof is required but missing or wrong.
   */
  async requireStepUp(
    userId: string,
    proof: { code?: string; passkeyResponse?: AuthenticationResponseJSON; challenge?: string },
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { _count: { select: { webauthnCredentials: true } } },
    });
    const hasTotp = user.totpEnabled && !!user.totpSecret;
    const hasPasskey = user._count.webauthnCredentials > 0;
    if (!hasTotp && !hasPasskey) return;

    if (proof.passkeyResponse && hasPasskey) {
      if (!proof.challenge) {
        throw new BadRequestException('Start the passkey check first');
      }
      const ok = await this.verifyAuthentication(userId, proof.passkeyResponse, proof.challenge);
      if (!ok) throw new BadRequestException('Passkey check failed');
      return;
    }
    if (proof.code && hasTotp) {
      if (!verifyTotpCode(userId, user.totpSecret, proof.code)) {
        throw new BadRequestException('Invalid authentication code');
      }
      return;
    }
    throw new BadRequestException(
      hasTotp
        ? 'Enter the 6-digit code from your authenticator to confirm this change'
        : 'Confirm with your passkey to make this change',
    );
  }

  async list(userId: string) {
    const rows = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toView(r));
  }

  /**
   * Remove a passkey — step-up required (requireStepUp): a code when TOTP is
   * enrolled, otherwise a passkey assertion. A passkey-only account proving
   * possession of a passkey to delete one is the same bar as everywhere else.
   */
  async remove(
    userId: string,
    id: string,
    proof: { code?: string; passkeyResponse?: AuthenticationResponseJSON; challenge?: string },
  ) {
    const credential = await this.prisma.webAuthnCredential.findFirst({
      where: { id, userId },
    });
    if (!credential) throw new NotFoundException('Passkey not found');

    await this.requireStepUp(userId, proof);

    await this.prisma.webAuthnCredential.delete({ where: { id: credential.id } });
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: userId,
      metadata: {
        event: 'passkey_removed',
        credentialId: credential.credentialId,
        label: credential.label,
      },
    });
    return { ok: true };
  }

  private toView(r: {
    id: string;
    label: string;
    deviceType: string;
    backedUp: boolean;
    discoverable: boolean | null;
    userVerified: boolean | null;
    createdAt: Date;
    lastUsedAt: Date | null;
  }) {
    return {
      id: r.id,
      label: r.label,
      deviceType: r.deviceType,
      backedUp: r.backedUp,
      // The one question /account needs answered: can this sign in on its own?
      passwordlessReady: isPasswordlessReady(r),
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
    };
  }
}

type AuthenticatorTransport = NonNullable<
  RegistrationResponseJSON['response']['transports']
>[number];
