import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { TOTP_REQUIRED_ROLES } from '@jumpstart/shared';
import { AuditService } from '../audit/audit.service';
import { encryptSecret, totpSecretContext } from '../common/crypto.util';
import { verifyTotpCode } from '../common/totp.util';
import { loadEnv } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PasskeysService, type PasskeyAssertion } from './passkeys.service';
import { PrismaService } from '../prisma/prisma.service';
import { revokeAllSessions } from './sessions.util';

/** Roles for which TOTP two-factor is mandatory (§3.1). */
const TOTP_REQUIRED = new Set<string>(TOTP_REQUIRED_ROLES);

// ── TOTP recovery codes ─────────────────────────────────────────────────────
const RECOVERY_CODE_COUNT = 10;
// No 0/O/1/I/L — codes get read off paper. randomInt per char avoids the
// modulo bias randomBytes % alphabet would carry.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

function generateRecoveryCode(): string {
  let out = '';
  for (let i = 0; i < 10; i++) out += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/** Case- and punctuation-tolerant: "abcde-23456" hashes like "ABCDE23456". */
const normalizeRecoveryCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Reset links die after an hour — long enough for email delivery, no longer. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface LoginResult {
  status: 'ok' | 'totp_required';
  /** totp_required only — internal to the controller, never sent to clients. */
  userId?: string;
  totpEnabled?: boolean;
  passkeyAvailable?: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    mustSetupTotp: boolean;
    chapter: string | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly passkeys: PasskeysService,
  ) {}

  async validateLogin(
    email: string,
    password: string,
    totpCode?: string,
    recoveryCode?: string,
    passkey?: PasskeyAssertion,
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { userRoles: { include: { role: true } }, regionScopes: true },
    });

    // Same failure message whether the account exists or not.
    if (!user || user.deletedAt) {
      await this.audit.log({
        action: 'login_failed',
        entityType: 'user',
        metadata: { email, reason: 'unknown_account' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordOk = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordOk) {
      await this.audit.log({
        userId: user.id,
        action: 'login_failed',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: 'bad_password' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    // 'invited' users may log in with their temporary password (admin invite
    // flow, §6.14) — first successful login activates the account below.
    if (user.status !== 'active' && user.status !== 'invited') {
      await this.audit.log({
        userId: user.id,
        action: 'login_failed',
        entityType: 'user',
        entityId: user.id,
        metadata: { reason: `status_${user.status}` },
      });
      throw new ForbiddenException('This account is not active');
    }

    const roles = user.userRoles.map((ur) => ur.role.key);
    const totpMandatory = roles.some((r) => TOTP_REQUIRED.has(r));
    const passkeyCount = await this.prisma.webAuthnCredential.count({
      where: { userId: user.id },
    });

    // A passkey is a second factor in its own right — an account holding only
    // passkeys (no TOTP) still gets the second-factor gate.
    if (user.totpEnabled || passkeyCount > 0) {
      if (passkey) {
        const ok = passkey.challenge
          ? await this.passkeys.verifyAuthentication(user.id, passkey.response, passkey.challenge)
          : false;
        if (!ok) {
          await this.audit.log({
            userId: user.id,
            action: 'login_failed',
            entityType: 'user',
            entityId: user.id,
            metadata: { reason: 'bad_passkey' },
          });
          throw new UnauthorizedException('Passkey sign-in failed — try again or use a code');
        }
      } else if (recoveryCode) {
        // Lost-authenticator fallback: burn a single-use recovery code.
        const remaining = await this.consumeRecoveryCode(user.id, recoveryCode);
        if (remaining === null) {
          await this.audit.log({
            userId: user.id,
            action: 'login_failed',
            entityType: 'user',
            entityId: user.id,
            metadata: { reason: 'bad_recovery_code' },
          });
          throw new UnauthorizedException('Invalid recovery code');
        }
        await this.audit.log({
          userId: user.id,
          action: 'update',
          entityType: 'user',
          entityId: user.id,
          metadata: { event: 'recovery_code_used', remainingRecoveryCodes: remaining },
        });
      } else if (!totpCode) {
        return {
          status: 'totp_required',
          userId: user.id,
          totpEnabled: user.totpEnabled,
          passkeyAvailable: passkeyCount > 0,
        };
      } else {
        // A 6-digit code only counts when TOTP is actually enrolled — a
        // passkey-only account must not accept guessed codes.
        const valid =
          user.totpEnabled &&
          verifyTotpCode(user.id, user.totpSecret, totpCode);
        if (!valid) {
          await this.audit.log({
            userId: user.id,
            action: 'login_failed',
            entityType: 'user',
            entityId: user.id,
            metadata: { reason: 'bad_totp' },
          });
          throw new UnauthorizedException('Invalid authentication code');
        }
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(user.status === 'invited' ? { status: 'active' } : {}) },
    });
    await this.audit.log({
      userId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
    });

    return {
      status: 'ok',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        mustSetupTotp: totpMandatory && !user.totpEnabled && passkeyCount === 0,
        chapter: user.regionScopes[0]?.state ?? null,
      },
    };
  }

  async startTotpSetup(userId: string): Promise<{ otpauthUrl: string; secret: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    const secret = authenticator.generateSecret();
    // Encrypted before it touches the database, bound to this user (H-4). The
    // raw secret leaves here only in the response the enrolling user is looking
    // at, which is the one place it legitimately has to appear.
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptSecret(secret, totpSecretContext(userId)) },
    });
    const otpauthUrl = authenticator.keyuri(user.email, 'JUMPSTART USA Platform', secret);
    return { otpauthUrl, secret };
  }

  /** Arms TOTP and returns the ONE-TIME recovery code set — never shown again. */
  async confirmTotpSetup(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Strictly a one-time enrollment transition: an enrolled user rotating
    // codes must go through regenerateRecoveryCodes (its own audit event).
    if (user.totpEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    if (!user.totpSecret) throw new BadRequestException('Start two-factor setup first');
    if (!verifyTotpCode(userId, user.totpSecret, code)) {
      throw new BadRequestException('Invalid authentication code');
    }
    // One transaction: the account must never end up totpEnabled with zero
    // recovery codes because the issuance half failed.
    const { codes, rows } = await this.mintRecoveryCodes(userId);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } }),
      this.prisma.totpRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.totpRecoveryCode.createMany({ data: rows }),
    ]);
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: userId,
      newValues: { totpEnabled: true, recoveryCodesIssued: RECOVERY_CODE_COUNT },
    });
    return { recoveryCodes: codes };
  }

  /**
   * Fresh recovery-code set, invalidating every previous code. Requires a
   * CURRENT authenticator code even though the session is signed in — an
   * unattended screen must not be enough to mint valid second factors.
   */
  async regenerateRecoveryCodes(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    if (!verifyTotpCode(userId, user.totpSecret, code)) {
      throw new BadRequestException('Invalid authentication code');
    }
    const { codes, rows } = await this.mintRecoveryCodes(userId);
    await this.prisma.$transaction([
      this.prisma.totpRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.totpRecoveryCode.createMany({ data: rows }),
    ]);
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: userId,
      metadata: { event: 'recovery_codes_regenerated', count: RECOVERY_CODE_COUNT },
    });
    return { recoveryCodes: codes };
  }

  /** How many unused recovery codes remain — drives the /account nudge. */
  async recoveryCodeStatus(userId: string): Promise<{ remaining: number }> {
    const remaining = await this.prisma.totpRecoveryCode.count({
      where: { userId, usedAt: null },
    });
    return { remaining };
  }

  /**
   * Mint a fresh raw set + the hashed rows for the caller's transaction (the
   * raw codes exist un-hashed only in the return value; rows store argon2
   * hashes, same posture as password-reset tokens). Hashing is SEQUENTIAL on
   * purpose: ten parallel argon2id hashes would monopolize the libuv thread
   * pool and starve concurrent logins.
   */
  private async mintRecoveryCodes(
    userId: string,
  ): Promise<{ codes: string[]; rows: { userId: string; codeHash: string }[] }> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    const rows: { userId: string; codeHash: string }[] = [];
    for (const code of codes) {
      rows.push({ userId, codeHash: await hashPassword(normalizeRecoveryCode(code)) });
    }
    return { codes, rows };
  }

  /**
   * Burn a matching unused recovery code. Returns the count still unused, or
   * null when nothing matched. The guarded updateMany makes the burn atomic:
   * two racing logins with the same code cannot both consume it.
   */
  private async consumeRecoveryCode(userId: string, raw: string): Promise<number | null> {
    const normalized = normalizeRecoveryCode(raw);
    if (!normalized) return null;
    const candidates = await this.prisma.totpRecoveryCode.findMany({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of candidates) {
      const match = await argon2.verify(row.codeHash, normalized).catch(() => false);
      if (!match) continue;
      const burned = await this.prisma.totpRecoveryCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (burned.count !== 1) return null; // lost the race — code already spent
      return this.prisma.totpRecoveryCode.count({ where: { userId, usedAt: null } });
    }
    return null;
  }

  /**
   * Self-service reset, step 1 (§3.1): store a HASHED single-use token and
   * email the raw one. Silent no-op for unknown or inactive accounts — the
   * endpoint's response never reveals whether an email is registered.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.deletedAt || (user.status !== 'active' && user.status !== 'invited')) {
      return;
    }

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${loadEnv().WEB_ORIGIN}/reset-password/${token}`;
    await this.mail.sendPasswordReset(user.email, user.firstName, resetUrl);
    await this.audit.log({
      userId: user.id,
      action: 'update',
      entityType: 'user',
      entityId: user.id,
      metadata: { event: 'password_reset_requested' },
    });
  }

  /**
   * Step 2: one valid token sets the new password, burns every outstanding
   * token for the account, and kills its sessions — whoever held the old
   * password is signed out on their next request.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, deletedAt: true, status: true } } },
    });
    const invalid =
      !row ||
      row.usedAt !== null ||
      row.expiresAt < new Date() ||
      row.user.deletedAt !== null ||
      row.user.status === 'deactivated';
    if (invalid) {
      throw new BadRequestException('This reset link is invalid or has expired — request a new one');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    const sessionsRevoked = await revokeAllSessions(this.prisma, row.userId);
    await this.audit.log({
      userId: row.userId,
      action: 'update',
      entityType: 'user',
      entityId: row.userId,
      metadata: { event: 'password_reset_completed', sessionsRevoked },
    });
  }

  /**
   * Change your own password, having proven the current one.
   *
   * Revokes EVERY session, not just the caller's: the request behind this is
   * almost always "I think someone else is in my account", and until this
   * revocation was added it was the one password path that left them there —
   * reset and staff-departure both swept sessions, this one only destroyed the
   * tab it was called from. The caller's own session goes with the rest, which
   * is why the controller sends them back to sign in.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    const sessionsRevoked = await revokeAllSessions(this.prisma, userId);
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: userId,
      metadata: { event: 'password_changed', sessionsRevoked },
    });
  }
}

export function hashPassword(password: string): Promise<string> {
  // argon2id defaults per OWASP: m=65536 (64 MiB), t=3, p=4
  return argon2.hash(password, { type: argon2.argon2id });
}
