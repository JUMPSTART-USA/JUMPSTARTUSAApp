import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { loadEnv } from '../../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense for a cookie-session API: state-changing requests must carry an
 * Origin (or Referer) matching WEB_ORIGIN. Combined with SameSite=Lax cookies
 * this blocks cross-site form posts without token round-trips. /public/*
 * endpoints are exempt — they are unauthenticated by design and POSTed to from
 * the WordPress site (protected by Turnstile + rate limits instead, §6.11).
 */
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) return next();
    const path = req.originalUrl.split('?')[0] ?? '';
    if (path.startsWith('/api/public/')) return next();

    const env = loadEnv();
    const origin = req.headers.origin ?? refererOrigin(req.headers.referer);
    // Same-origin requests may omit Origin (older agents); only mismatches fail.
    if (origin && origin !== env.WEB_ORIGIN && origin !== selfOrigin(req)) {
      throw new ForbiddenException('Cross-origin request rejected');
    }
    next();
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

function selfOrigin(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol;
  return `${proto}://${req.headers.host}`;
}
