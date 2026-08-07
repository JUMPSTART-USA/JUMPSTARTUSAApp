import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { AuditService } from '../audit/audit.service';
import { loadEnv } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

/** Roles for which TOTP two-factor is mandatory (§3.1). */
const TOTP_REQUIRED_ROLES = new Set(['admin', 'executive']);

/** Reset links die after an hour — long enough for email delivery, no longer. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface LoginResult {
  status: 'ok' | 'totp_required';
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
  ) {}

  async validateLogin(email: string, password: string, totpCode?: string): Promise<LoginResult> {
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
    const totpMandatory = roles.some((r) => TOTP_REQUIRED_ROLES.has(r));

    if (user.totpEnabled) {
      if (!totpCode) return { status: 'totp_required' };
      const valid = authenticator.verify({ token: totpCode, secret: user.totpSecret ?? '' });
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
        mustSetupTotp: totpMandatory && !user.totpEnabled,
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
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    const otpauthUrl = authenticator.keyuri(user.email, 'JUMPSTART USA Platform', secret);
    return { otpauthUrl, secret };
  }

  async confirmTotpSetup(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret) throw new BadRequestException('Start two-factor setup first');
    if (!authenticator.verify({ token: code, secret: user.totpSecret })) {
      throw new BadRequestException('Invalid authentication code');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: userId,
      newValues: { totpEnabled: true },
    });
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
    await this.prisma.$executeRaw`DELETE FROM "session" WHERE sess->>'userId' = ${row.userId}`;
    await this.audit.log({
      userId: row.userId,
      action: 'update',
      entityType: 'user',
      entityId: row.userId,
      metadata: { event: 'password_reset_completed' },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await this.audit.log({
      userId,
      action: 'update',
      entityType: 'user',
      entityId: userId,
      metadata: { event: 'password_changed' },
    });
  }
}

export function hashPassword(password: string): Promise<string> {
  // argon2id defaults per OWASP: m=65536 (64 MiB), t=3, p=4
  return argon2.hash(password, { type: argon2.argon2id });
}
