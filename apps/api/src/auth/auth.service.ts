import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** Roles for which TOTP two-factor is mandatory (§3.1). */
const TOTP_REQUIRED_ROLES = new Set(['admin', 'executive']);

export interface LoginResult {
  status: 'ok' | 'totp_required';
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    mustSetupTotp: boolean;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async validateLogin(email: string, password: string, totpCode?: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { userRoles: { include: { role: true } } },
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

    if (user.status !== 'active') {
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
      data: { lastLoginAt: new Date() },
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
