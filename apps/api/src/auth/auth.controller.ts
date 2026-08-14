import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  CHAPTER_STATES,
  forgotPasswordSchema,
  loginSchema,
  ROLE_KEYS,
  setPasswordSchema,
  type ChangePasswordInput,
  type ChapterState,
  type ForgotPasswordInput,
  type LoginInput,
  type RoleKey,
  type SetPasswordInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Public } from '../common/decorators';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedRequest, AuthenticatedUser } from '../common/types';
import { AuthService } from './auth.service';

const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const viewAsSchema = z.object({
  role: z.enum(ROLE_KEYS).nullable().optional(),
  chapter: z.enum(CHAPTER_STATES).nullable().optional(),
});
type ViewAsInput = z.infer<typeof viewAsSchema>;

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
    const result = await this.authService.validateLogin(
      body.email,
      body.password,
      body.totpCode,
      body.recoveryCode,
    );
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
      actualRoles: user.actualRoles,
      viewAsRole: user.viewAsRole,
      totpEnabled: user.totpEnabled,
      mustSetupTotp: user.mustSetupTotp,
      chapter: user.chapter,
      actualChapter: user.actualChapter,
      allowedChapters: user.allowedChapters,
      viewChapter: user.viewChapter,
    };
  }

  /**
   * "View as" preview: role (admins only) and/or chapter (any account allowed
   * to view more than one chapter, or all). Stored on the session and applied
   * by SessionAuthGuard, so the API itself enforces the narrowed access — not
   * just the SPA's nav. Setting is gated on the account's REAL roles/scopes;
   * clearing (null) is always allowed, so a preview can always be exited even
   * while the effective permissions are narrowed. Omitted fields are left
   * unchanged.
   */
  @Post('view-as')
  @HttpCode(200)
  async viewAs(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(viewAsSchema)) body: ViewAsInput,
    @Req() req: AuthenticatedRequest,
  ) {
    if (body.role !== undefined) {
      // Previewing admin is just normal access — treat it as exiting.
      const role: RoleKey | null = body.role === 'admin' ? null : body.role;
      if (role && !user.actualRoles.includes('admin')) {
        throw new ForbiddenException('Only administrators can preview other roles');
      }
      if (role) req.session.viewAsRole = role;
      else delete req.session.viewAsRole;
    }
    if (body.chapter !== undefined) {
      const chapter: ChapterState | null = body.chapter;
      if (
        chapter &&
        user.allowedChapters !== null &&
        (user.allowedChapters.length <= 1 || !user.allowedChapters.includes(chapter))
      ) {
        throw new ForbiddenException('Your account cannot switch to that chapter');
      }
      if (chapter) req.session.viewChapter = chapter;
      else delete req.session.viewChapter;
    }
    const state = {
      viewAsRole: req.session.viewAsRole ?? null,
      viewChapter: req.session.viewChapter ?? null,
    };
    await this.audit.log({
      userId: user.id,
      action: 'permission_change',
      entityType: 'session',
      entityId: user.id,
      metadata: state,
    });
    return { ok: true, ...state };
  }

  @Post('totp/setup')
  async totpSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.startTotpSetup(user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // argon2 burst guard
  @Post('totp/confirm')
  async totpConfirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(totpCodeSchema)) body: { code: string },
  ) {
    const { recoveryCodes } = await this.authService.confirmTotpSetup(user.id, body.code);
    return { ok: true, recoveryCodes };
  }

  /** Remaining unused recovery codes — the /account page's nudge counter. */
  @Get('totp/recovery-codes')
  totpRecoveryCodeStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.recoveryCodeStatus(user.id);
  }

  /** Fresh set, old set dead. Demands a current code — see the service note. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // argon2 burst guard
  @Post('totp/recovery-codes')
  totpRegenerateRecoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(totpCodeSchema)) body: { code: string },
  ) {
    return this.authService.regenerateRecoveryCodes(user.id, body.code);
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

  /**
   * Self-service reset, step 1 (§3.1). ALWAYS answers { ok: true } —
   * responses never reveal whether an email is registered. Tightly throttled:
   * each request can send an email.
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body(zodBody(forgotPasswordSchema)) body: ForgotPasswordInput) {
    await this.authService.requestPasswordReset(body.email);
    return { ok: true };
  }

  /** Step 2: the emailed single-use token sets the new password. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body(zodBody(setPasswordSchema)) body: SetPasswordInput) {
    await this.authService.resetPassword(body.token, body.password);
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
