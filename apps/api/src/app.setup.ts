import type { NestExpressApplication } from '@nestjs/platform-express';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import helmet from 'helmet';
import { Pool } from 'pg';
import { isProduction, loadEnv } from './config/env';

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min idle (§7.1)
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
