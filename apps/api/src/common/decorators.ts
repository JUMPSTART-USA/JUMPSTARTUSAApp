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
