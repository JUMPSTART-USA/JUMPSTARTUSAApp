import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Put,
  Query,
} from '@nestjs/common';
import { CHAPTER_STATES,
  createUserSchema,
  listQuerySchema,
  updateUserSchema,
  USER_STATUSES,
  uuid,
  type CreateUserInput,
  type ListQuery,
  type UpdateUserInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedRequest, AuthenticatedUser } from '../../common/types';
import { AdminUsersService } from './users.service';

const listFiltersSchema = listQuerySchema.extend({
  status: z.enum(USER_STATUSES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const deactivateSchema = z.object({ reassignToUserId: uuid });

/** Step-up proof: the ACTING admin's own current code (required once they have TOTP). */
const resetTotpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
  stepUpPasskeyResponse: z.object({ id: z.string().min(1) }).passthrough().optional(),
});
type ResetTotpInput = z.infer<typeof resetTotpSchema>;
type DeactivateInput = z.infer<typeof deactivateSchema>;

/**
 * The same proof, carried alongside a user edit. Optional here because the
 * service only demands it for the SENSITIVE fields (email, roles) — a
 * corrected surname should not need an authenticator.
 */
const updateUserWithStepUpSchema = updateUserSchema.extend(resetTotpSchema.shape);
type UpdateUserWithStepUp = z.infer<typeof updateUserWithStepUpSchema>;

// One chapter or all: at most one scope row; empty = all chapters (§7.2).
const regionScopesSchema = z.object({
  states: z.array(z.enum(CHAPTER_STATES)).max(1, 'Assign one chapter, or none for all chapters'),
});
type RegionScopesInput = z.infer<typeof regionScopesSchema>;

@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @RequirePermission('admin.users')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { status, ...listQuery } = query;
    return this.users.list(listQuery as ListQuery, { status });
  }

  @Get(':id')
  @RequirePermission('admin.users')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  @RequirePermission('admin.users')
  create(
    @Body(zodBody(createUserSchema)) body: CreateUserInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.create(body, user.id);
  }

  /**
   * Role changes go through this PATCH too — no separate roles endpoint.
   *
   * Carries an OPTIONAL step-up proof, which the service demands only when the
   * edit touches email or roles. Everything else stays a plain edit.
   */
  @Patch(':id')
  @RequirePermission('admin.users')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateUserWithStepUpSchema)) body: UpdateUserWithStepUp,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthenticatedRequest,
  ) {
    const { code, stepUpPasskeyResponse, ...input } = body;
    const challenge = req.session.webauthnStepUpChallenge;
    delete req.session.webauthnStepUpChallenge;
    return this.users.update(id, input as UpdateUserInput, user.id, {
      code,
      passkeyResponse: stepUpPasskeyResponse as never,
      challenge,
    });
  }

  @Post(':id/deactivate')
  @RequirePermission('admin.users')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(deactivateSchema)) body: DeactivateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.deactivate(id, body.reassignToUserId, user.id);
  }

  @Post(':id/reactivate')
  @RequirePermission('admin.users')
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.reactivate(id, user.id);
  }

  @Post(':id/resend-invite')
  @RequirePermission('admin.users')
  resendInvite(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.resendInvite(id, user.id);
  }

  /** Lost-authenticator rescue — clears TOTP so the user can re-enroll. */
  @Post(':id/reset-totp')
  @RequirePermission('admin.users')
  resetTotp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(resetTotpSchema)) body: ResetTotpInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthenticatedRequest,
  ) {
    const challenge = req.session.webauthnStepUpChallenge;
    delete req.session.webauthnStepUpChallenge;
    return this.users.resetTotp(id, user.id, {
      code: body.code,
      passkeyResponse: body.stepUpPasskeyResponse as never,
      challenge,
    });
  }

  /**
   * Issue a password-reset link. Step-up proofed like reset-totp: the link it
   * returns can set the account's password, so it is a route to acting as that
   * user.
   */
  @Post(':id/reset-password')
  @RequirePermission('admin.users')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(resetTotpSchema)) body: ResetTotpInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthenticatedRequest,
  ) {
    const challenge = req.session.webauthnStepUpChallenge;
    delete req.session.webauthnStepUpChallenge;
    return this.users.resetPassword(id, user.id, {
      code: body.code,
      passkeyResponse: body.stepUpPasskeyResponse as never,
      challenge,
    });
  }

  /** Lost-phone rescue that keeps the authenticator app: passkeys only. */
  @Post(':id/remove-passkeys')
  @RequirePermission('admin.users')
  removePasskeys(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(resetTotpSchema)) body: ResetTotpInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthenticatedRequest,
  ) {
    const challenge = req.session.webauthnStepUpChallenge;
    delete req.session.webauthnStepUpChallenge;
    return this.users.removePasskeys(id, user.id, {
      code: body.code,
      passkeyResponse: body.stepUpPasskeyResponse as never,
      challenge,
    });
  }

  /**
   * Close the door without touching anything else. No step-up: this changes
   * ACCESS, not how the account is secured, and it is reversible — the same
   * bar deactivate/reactivate already sit at.
   */
  @Post(':id/suspend-sign-in')
  @RequirePermission('admin.users')
  suspendSignIn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.suspendSignIn(id, user.id);
  }

  @Post(':id/restore-sign-in')
  @RequirePermission('admin.users')
  restoreSignIn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.users.restoreSignIn(id, user.id);
  }

  @Get(':id/region-scopes')
  @RequirePermission('admin.users')
  getRegionScopes(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getRegionScopes(id);
  }

  @Put(':id/region-scopes')
  @RequirePermission('admin.users')
  setRegionScopes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(regionScopesSchema)) body: RegionScopesInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.users.setRegionScopes(id, body.states, user.id);
  }
}
