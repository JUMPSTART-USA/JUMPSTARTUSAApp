import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { PasskeysService, type PasskeyAssertion } from './passkeys.service';

const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** Step-up proof accepted by every add/remove-a-factor route (§3.2). */
const stepUpProofSchema = {
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
  stepUpPasskeyResponse: z.object({ id: z.string().min(1) }).passthrough().optional(),
};

const passkeyRegisterSchema = z.object({
  label: z.string().trim().min(1, 'Name this passkey').max(60),
  response: z.object({ id: z.string().min(1) }).passthrough(),
  ...stepUpProofSchema,
});
type PasskeyRegisterInput = z.infer<typeof passkeyRegisterSchema>;

/** POST (not DELETE): removal carries the step-up proof in the body. */
const passkeyRemoveSchema = z.object({ ...stepUpProofSchema });
type PasskeyRemoveInput = z.infer<typeof passkeyRemoveSchema>;
const viewAsSchema = z.object({
  role: z.enum(ROLE_KEYS).nullable().optional(),
  chapter: z.enum(CHAPTER_STATES).nullable().optional(),
});
type ViewAsInput = z.infer<typeof viewAsSchema>;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passkeys: PasskeysService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // brute-force guard
  @Post('login')
  @HttpCode(200)
  async login(@Body(zodBody(loginSchema)) body: LoginInput, @Req() req: AuthenticatedRequest) {
    // Challenges are single-use: consume the session's copy up front so a
    // failed assertion cannot be replayed against the same challenge.
    const pendingChallenge = req.session.webauthnChallenge;
    if (body.passkeyResponse) delete req.session.webauthnChallenge;

    let result: Awaited<ReturnType<AuthService['validateLogin']>>;
    try {
      result = await this.authService.validateLogin(
        body.email,
        body.password,
        body.totpCode,
        body.recoveryCode,
        body.passkeyResponse
          ? {
              response: body.passkeyResponse as unknown as PasskeyAssertion['response'],
              challenge: pendingChallenge,
            }
          : undefined,
      );
    } catch (err) {
      // A failed passkey attempt already consumed the challenge above.
      // Without a fresh one the user is wedged: the SPA still holds dead
      // options and every retry fails for the wrong reason. Re-arm first.
      if (body.passkeyResponse) await this.reissuePasskeyChallenge(body.email, req);
      throw err;
    }
    if (result.status === 'totp_required') {
      // Offer a passkey ceremony alongside the code prompt when one exists.
      const passkeyOptions = result.passkeyAvailable
        ? await this.passkeys.authenticationOptions(result.userId!)
        : null;
      if (passkeyOptions) req.session.webauthnChallenge = passkeyOptions.challenge;
      return { totpRequired: true, totpEnabled: result.totpEnabled, passkeyOptions };
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

  /**
   * Re-arm the login ceremony after a failed assertion. Silent on any lookup
   * failure by design: this runs where the caller has proven nothing, so it
   * must never become an account-existence oracle.
   */
  private async reissuePasskeyChallenge(email: string, req: AuthenticatedRequest) {
    try {
      const options = await this.passkeys.authenticationOptionsForEmail(email);
      if (options) req.session.webauthnChallenge = options.challenge;
    } catch {
      /* ignore — the original error is what the caller must see */
    }
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
      passkeyCount: user.passkeyCount,
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

  // ── Passkeys (§3.2) — registration is a two-step ceremony; the challenge
  // lives on the session between the calls ─────────────────────────────────

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('passkeys/registration-options')
  async passkeyRegistrationOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthenticatedRequest,
  ) {
    const options = await this.passkeys.registrationOptions(user.id);
    req.session.webauthnChallenge = options.challenge;
    return options;
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('passkeys/registration-verify')
  async passkeyRegistrationVerify(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(passkeyRegisterSchema)) body: PasskeyRegisterInput,
    @Req() req: AuthenticatedRequest,
  ) {
    const challenge = req.session.webauthnChallenge;
    delete req.session.webauthnChallenge; // single-use
    const stepUpChallenge = req.session.webauthnStepUpChallenge;
    delete req.session.webauthnStepUpChallenge;
    if (!challenge) throw new UnauthorizedException('Start passkey registration first');
    return this.passkeys.verifyRegistration(
      user.id,
      body.label,
      body.response as unknown as Parameters<PasskeysService['verifyRegistration']>[2],
      challenge,
      {
        code: body.code,
        passkeyResponse: body.stepUpPasskeyResponse as unknown as PasskeyAssertion['response'],
        challenge: stepUpChallenge,
      },
    );
  }

  @Get('passkeys')
  listPasskeys(@CurrentUser() user: AuthenticatedUser) {
    return this.passkeys.list(user.id);
  }

  /** Step-up required (service) — throttled like every other code check. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('passkeys/:id/remove')
  removePasskey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(passkeyRemoveSchema)) body: PasskeyRemoveInput,
    @Req() req: AuthenticatedRequest,
  ) {
    const stepUpChallenge = req.session.webauthnStepUpChallenge;
    delete req.session.webauthnStepUpChallenge;
    return this.passkeys.remove(user.id, id, {
      code: body.code,
      passkeyResponse: body.stepUpPasskeyResponse as unknown as PasskeyAssertion['response'],
      challenge: stepUpChallenge,
    });
  }

  /** Challenge for proving possession while signed in (add/remove a factor). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('passkeys/step-up-options')
  async passkeyStepUpOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthenticatedRequest,
  ) {
    const options = await this.passkeys.stepUpOptions(user.id);
    if (!options) throw new BadRequestException('No passkey is registered on this account');
    req.session.webauthnStepUpChallenge = options.challenge;
    return options;
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
