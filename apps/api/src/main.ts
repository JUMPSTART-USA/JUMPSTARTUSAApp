import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import helmet from 'helmet';
import { Pool } from 'pg';
import { AppModule } from './app.module';
import { isProduction, loadEnv } from './config/env';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min idle (§7.1)
const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 h absolute (§7.1)

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  if (!isProduction()) {
    const config = new DocumentBuilder()
      .setTitle('JUMPSTART USA Operations Platform API')
      .setDescription(
        'Internal staff API + public intake endpoints. Session-cookie auth; RBAC enforced per endpoint.',
      )
      .setVersion('0.1.0')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(env.API_PORT);
  new Logger('Bootstrap').log(
    `API listening on :${env.API_PORT} (${env.NODE_ENV}) — docs at /api/docs`,
  );
}

bootstrap().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
