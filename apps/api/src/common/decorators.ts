import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { PermissionKey } from '@jumpstart/shared';
import type { AuthenticatedRequest, AuthenticatedUser } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
/** Skip session auth — ONLY for /auth/login, /public/* and /health. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SKIP_ORIGIN_CHECK_KEY = 'skipOriginCheck';
/**
 * Exempt an endpoint from the cross-origin (CSRF) check.
 *
 * ONLY for endpoints posted to from somewhere other than the SPA: today the
 * tokenized participant portal and the WordPress intake forms, which are
 * unauthenticated by design and defended by Turnstile, rate limits and an
 * unguessable token instead.
 *
 * This used to be `req.originalUrl.startsWith('/api/public/')` — an
 * unnormalised string comparison against a raw URL, deciding whether to skip a
 * security check. Express does not resolve `..` segments so it was not
 * exploitable, but it depended on that staying true, and it silently exempted
 * anything a future author mounted under that prefix. Route metadata cannot be
 * spoofed by a URL, and it puts the exemption on the handler that has it.
 */
export const SkipOriginCheck = () => SetMetadata(SKIP_ORIGIN_CHECK_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
/**
 * Declare the permission(s) an endpoint requires. Multiple keys = ALL required.
 * Every non-@Public endpoint must carry at least one @RequirePermission —
 * a CI test enumerates routes and fails on unprotected handlers.
 */
export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Injects the AuthenticatedUser loaded by SessionAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
