import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  loginSchema,
  type ChangePasswordInput,
  type LoginInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Public } from '../common/decorators';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedRequest, AuthenticatedUser } from '../common/types';
import { AuthService } from './auth.service';

const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // brute-force guard
  @Post('login')
  @HttpCode(200)
  async login(@Body(zodBody(loginSchema)) body: LoginInput, @Req() req: AuthenticatedRequest) {
    const result = await this.authService.validateLogin(body.email, body.password, body.totpCode);
    if (result.status === 'totp_required') {
      return { totpRequired: true };
    }
    // Regenerate the session id on privilege change (fixation defense).
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.userId = result.user!.id;
    req.session.totpVerified = true;
    (req.session as unknown as { loginAt: number }).loginAt = Date.now();
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthenticatedUser, @Req() req: AuthenticatedRequest) {
    await this.audit.log({
      userId: user.id,
      action: 'logout',
      entityType: 'user',
      entityId: user.id,
    });
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve())),
    );
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      permissions: [...user.permissions],
    };
  }

  @Post('totp/setup')
  async totpSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.startTotpSetup(user.id);
  }

  @Post('totp/confirm')
  async totpConfirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(totpCodeSchema)) body: { code: string },
  ) {
    await this.authService.confirmTotpSetup(user.id, body.code);
    return { ok: true };
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(changePasswordSchema)) body: ChangePasswordInput,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.authService.changePassword(user.id, body.currentPassword, body.password);
    // Password change invalidates the current session; sign in again.
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    return { ok: true };
  }

  /** Used by the SPA to detect an expired session without a 401 redirect loop. */
  @Public()
  @Get('session')
  session(@Req() req: AuthenticatedRequest) {
    if (!req.session?.userId) throw new UnauthorizedException();
    return { ok: true };
  }
}
