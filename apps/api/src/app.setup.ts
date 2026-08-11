import type { NestExpressApplication } from '@nestjs/platform-express';
import connectPgSimple from 'connect-pg-simple';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { Pool } from 'pg';
import { isProduction, loadEnv } from './config/env';
import { SESSION_IDLE_TIMEOUT_MS } from '@jumpstart/shared';

// Re-exported from @jumpstart/shared so the browser's expiry warning counts
// down against the same number this enforces (§7.1).
export const IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MS;
export const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 h absolute (§7.1)

/**
 * Everything between `NestFactory.create` and `listen` — shared by main.ts and
 * the integration tests so tests exercise the real session/CSRF/prefix wiring.
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const env = loadEnv();

  // Behind the PaaS proxy in staging/production — needed for secure cookies.
  app.set('trust proxy', 1);

  // Every route lives under /api — including /api/public/* intake endpoints
  // and /api/health — so the SPA and WordPress forms target one base URL.
  app.setGlobalPrefix('api');

  app.use(helmet());
  app.enableCors({
    origin: [env.WEB_ORIGIN],
    credentials: true,
  });

  /**
   * No browser may cache an API response. Every payload is session-scoped and
   * permission-filtered (and chapter-filtered since §7.2), so a cache hit can
   * surface another view's data.
   *
   * Express sends an ETag with NO Cache-Control, which leaves responses
   * *heuristically* cacheable. Safari reuses those across the full page reload
   * the SPA performs after a "view as" change, so clearing a chapter preview
   * looked like it did nothing: the session was cleared server-side but the
   * reload re-rendered a STALE cached /auth/me still naming the old chapter.
   * Chrome revalidates and hid the bug.
   */
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const PgStore = connectPgSimple(session);
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  app.use(
    session({
      store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
      name: 'jumpstart.sid',
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true, // each request extends the cookie → idle timeout
      cookie: {
        httpOnly: true,
        secure: isProduction(),
        sameSite: 'lax',
        maxAge: IDLE_TIMEOUT_MS,
      },
    }),
  );

  // Absolute session lifetime: even active sessions re-authenticate after 12 h.
  app.use((req: any, _res: any, next: () => void) => {
    const loginAt = req.session?.loginAt as number | undefined;
    if (loginAt && Date.now() - loginAt > ABSOLUTE_TIMEOUT_MS) {
      req.session.destroy(() => next());
      return;
    }
    next();
  });

  return app;
}
