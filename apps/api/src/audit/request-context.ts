import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Where the current request came from, available to anything running under it
 * without being passed an argument.
 *
 * AuditService is called from something like a hundred places. Threading `req`
 * into every one of them to reach two strings would be a large, invasive
 * change that a new call site could silently forget — and a forgotten one
 * writes a row with no source, which is exactly the gap being closed. An
 * AsyncLocalStorage store means the context follows the await chain and every
 * audit write picks it up whether its author thought about it or not.
 */
export interface AuditRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<AuditRequestContext>();

/** The current request's context, or nulls when there is no request (jobs, seeds). */
export function currentAuditContext(): AuditRequestContext {
  return storage.getStore() ?? { ipAddress: null, userAgent: null };
}

/** Run `fn` with an explicit context. Exposed for tests. */
export function withAuditContext<T>(context: AuditRequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

@Injectable()
export class AuditRequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    storage.run(
      {
        /**
         * `req.ip` and not a header: express resolves it through the
         * `trust proxy 1` setting configured in app.setup.ts, so this is the
         * client address as seen by the one proxy we trust, rather than
         * whatever an X-Forwarded-For a caller chose to send.
         */
        ipAddress: req.ip ?? null,
        // Bounded: this is an attacker-supplied string going into a column.
        userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
      },
      () => next(),
    );
  }
}
