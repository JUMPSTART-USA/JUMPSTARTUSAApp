import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { loadEnv, webOrigins } from '../../config/env';
import { SKIP_ORIGIN_CHECK_KEY } from '../decorators';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for a cookie-session API: a state-changing request must carry an
 * Origin naming a trusted web origin. With SameSite=Lax cookies this blocks
 * cross-site form posts without token round-trips.
 *
 * Two changes from the middleware this replaces.
 *
 * It is a GUARD, so the exemption is read from route metadata
 * (@SkipOriginCheck) instead of by string-matching the raw URL. A security
 * decision made by `startsWith` on an unnormalised path is a security decision
 * one routing change away from being wrong.
 *
 * And a MISSING Origin is now refused rather than allowed. The old check only
 * rejected a mismatch, with a note that older agents may omit the header —
 * every browser has sent Origin on state-changing requests for years, so what
 * that actually allowed was any non-browser client to skip the check entirely
 * by simply not sending one. Referer is accepted as a fallback for the same
 * reason it always was: some privacy tooling strips Origin but not Referer.
 */
@Injectable()
export class OriginCheckGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ORIGIN_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const origin = request.headers.origin ?? refererOrigin(request.headers.referer);
    if (!origin) {
      throw new ForbiddenException('Missing Origin header on a state-changing request');
    }
    if (!webOrigins(loadEnv()).includes(origin)) {
      throw new ForbiddenException('Cross-origin request rejected');
    }
    return true;
  }
}

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
